import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import {
  LlmProvider,
  LlmRateLimitedError,
  LlmUnavailableError,
} from '../src/chatbot/domain/LlmProvider';
import { hashAnonToken } from '../src/chatbot/application/chat.service';
import { fallbackReply } from '../src/chatbot/application/fallback-reply';
import {
  type FakeLlmProvider,
  type FakeLlmStep,
  textResponse,
  toolCallResponse,
} from '../src/chatbot/application/testing/fake-llm.provider';
import { TreatmentsService } from '../src/treatments/application/treatments.service';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { ScriptedLlmProvider } from './support/scripted-llm.provider';

/**
 * Resiliencia del chatbot de punta a punta (CLI-96): ante cualquier falla del
 * LLM o de una tool, el usuario recibe una respuesta genérica (nunca un 500,
 * un stack ni el mensaje interno), el error_code queda persistido para la
 * observabilidad (CLI-98) y el resto de la API sigue respondiendo. Todo por
 * el canal anónimo: no hace falta ningún usuario en la base.
 */

const FINAL_REPLY = 'Listo.';
const INTERNAL_MESSAGE = 'boom: detalle interno';

interface Turn {
  status: number;
  reply: string;
  sessionToken: string;
}

async function bootstrap(
  override?: ScriptedLlmProvider,
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (override) {
    builder.overrideProvider(LlmProvider).useValue(override);
  }
  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

describe('Chatbot: resiliencia (e2e) — CLI-96', () => {
  const anonTokens: string[] = [];

  beforeAll(() => {
    process.env['CHATBOT_ENABLED'] = 'true';
    // Todos los requests salen de la misma IP: el rate limit no es lo que se prueba acá.
    process.env['THROTTLE_CHAT_PUBLIC_PER_HOUR'] = '1000';
  });

  afterEach(() => jest.restoreAllMocks());

  async function send(app: NestExpressApplication): Promise<Turn> {
    const res = await request(app.getHttpServer())
      .post('/public/chat/messages')
      .send({ message: 'Hola, una consulta' });
    const body = res.body as { reply?: string; sessionToken?: string };
    if (body.sessionToken) anonTokens.push(body.sessionToken);
    return {
      status: res.status,
      reply: body.reply ?? '',
      sessionToken: body.sessionToken ?? '',
    };
  }

  async function storedErrorCode(
    prisma: PrismaService,
    sessionToken: string,
  ): Promise<string | null> {
    const message = await prisma.chat_messages.findFirst({
      where: {
        role: 'assistant',
        chat_sessions: { anon_token_hash: hashAnonToken(sessionToken) },
      },
      select: { error_code: true },
    });
    return message?.error_code ?? null;
  }

  function expectNoInternals(turn: Turn): void {
    expect(turn.status).toBe(200);
    expect(turn.reply).not.toContain('boom');
    expect(turn.reply).not.toMatch(/Error|stack|\n\s+at /);
  }

  describe('con el LLM guionado', () => {
    const llm = new ScriptedLlmProvider();
    let app: NestExpressApplication;
    let prisma: PrismaService;
    let treatments: TreatmentsService;

    beforeAll(async () => {
      app = await bootstrap(llm);
      prisma = app.get(PrismaService);
      treatments = app.get(TreatmentsService);
    });

    afterAll(async () => {
      await prisma.chat_sessions.deleteMany({
        where: { anon_token_hash: { in: anonTokens.map(hashAnonToken) } },
      });
      const leftovers = await prisma.chat_sessions.count({
        where: { anon_token_hash: { in: anonTokens.map(hashAnonToken) } },
      });
      await app.close();
      expect(leftovers).toBe(0);
    });

    /** Un turno donde el "modelo" pide `name` y después contesta texto; devuelve lo que vio de la tool. */
    async function toolTurn(
      call: Parameters<typeof toolCallResponse>[0],
    ): Promise<{ turn: Turn; fake: FakeLlmProvider; toolResult: unknown }> {
      const fake = llm.script([
        toolCallResponse(call),
        textResponse(FINAL_REPLY),
      ]);
      const turn = await send(app);
      const toolMessage = fake.requests[1]?.messages.find(
        (m) => m.role === 'tool',
      );
      return {
        turn,
        fake,
        toolResult: toolMessage ? JSON.parse(toolMessage.content) : undefined,
      };
    }

    it.each<[string, FakeLlmStep, string]>([
      ['1. LLM caído', new LlmUnavailableError(), 'llm_unavailable'],
      [
        '2. límite de uso del LLM',
        new LlmRateLimitedError(),
        'llm_rate_limited',
      ],
      [
        'error inesperado del LLM',
        new Error(INTERNAL_MESSAGE),
        'internal_error',
      ],
    ])(
      '%s → 200 con el fallback y el error_code persistido',
      async (_name, step, errorCode) => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation();
        llm.script([step]);

        const turn = await send(app);

        expectNoInternals(turn);
        expect(turn.reply).toBe(fallbackReply('es'));
        await expect(storedErrorCode(prisma, turn.sessionToken)).resolves.toBe(
          errorCode,
        );
      },
    );

    it('3. argumentos que no son JSON → invalid_arguments y el turno sigue', async () => {
      const { turn, fake, toolResult } = await toolTurn({
        name: 'list_services',
        argumentsJson: '{"category": ',
      });

      expect(toolResult).toEqual({ error: 'invalid_arguments' });
      expect(fake.requests).toHaveLength(2);
      expect(turn.reply).toBe(FINAL_REPLY);
      await expect(
        storedErrorCode(prisma, turn.sessionToken),
      ).resolves.toBeNull();
    });

    it('4. tool inexistente → unknown_tool y el turno sigue', async () => {
      const { turn, toolResult } = await toolTurn({ name: 'drop_everything' });

      expect(toolResult).toEqual({ error: 'unknown_tool' });
      expect(turn.reply).toBe(FINAL_REPLY);
    });

    it('5. el service de una tool lanza → internal_error, sin el mensaje interno', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      jest
        .spyOn(treatments, 'findActive')
        .mockRejectedValue(new Error(INTERNAL_MESSAGE));

      const { turn, fake, toolResult } = await toolTurn({
        name: 'list_services',
      });

      expect(toolResult).toEqual({ error: 'internal_error' });
      expect(JSON.stringify(fake.requests)).not.toContain('boom');
      expectNoInternals(turn);
      expect(turn.reply).toBe(FINAL_REPLY);
    });

    it('6. una tool más lenta que CHAT_TOOL_TIMEOUT_MS → timeout', async () => {
      process.env['CHAT_TOOL_TIMEOUT_MS'] = '50';
      jest
        .spyOn(treatments, 'findActive')
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve([]), 500)),
        );
      try {
        const { turn, toolResult } = await toolTurn({ name: 'list_services' });

        expect(toolResult).toEqual({ error: 'timeout' });
        expect(turn.reply).toBe(FINAL_REPLY);
      } finally {
        delete process.env['CHAT_TOOL_TIMEOUT_MS'];
      }
    });

    it('7. un modelo que pide tools sin parar se corta y responde sin tools', async () => {
      const loop = toolCallResponse({ name: 'get_clinic_info' });
      const fake = llm.script([
        loop,
        loop,
        loop,
        loop,
        textResponse(FINAL_REPLY),
      ]);

      const turn = await send(app);

      // 4 iteraciones con tools (CHAT_MAX_TOOL_ITERATIONS) + la final forzada.
      expect(fake.requests).toHaveLength(5);
      expect(fake.requests[4].tools).toEqual([]);
      expect(turn.reply).toBe(FINAL_REPLY);
    });

    it.each([
      ['null', null],
      ['vacía', ''],
    ])('8. respuesta %s del LLM → fallback', async (_name, content) => {
      llm.script([textResponse(content)]);

      const turn = await send(app);

      expect(turn.status).toBe(200);
      expect(turn.reply).toBe(fallbackReply('es'));
      await expect(storedErrorCode(prisma, turn.sessionToken)).resolves.toBe(
        'empty_response',
      );
    });

    it('9. CHATBOT_ENABLED=false → 503 genérico y el resto de la API responde', async () => {
      const fake = llm.script([textResponse(FINAL_REPLY)]);
      process.env['CHATBOT_ENABLED'] = 'false';
      try {
        const res = await request(app.getHttpServer())
          .post('/public/chat/messages')
          .send({ message: 'Hola' });

        expect(res.status).toBe(503);
        expect(JSON.stringify(res.body)).not.toContain('CHATBOT_ENABLED');
        expect(fake.requests).toHaveLength(0);
        await request(app.getHttpServer()).get('/public/doctors').expect(200);
      } finally {
        process.env['CHATBOT_ENABLED'] = 'true';
      }
    });
  });

  describe('10. sin GROQ_API_KEY', () => {
    let app: NestExpressApplication;
    let prisma: PrismaService;
    const originalKey = process.env['GROQ_API_KEY'];

    beforeAll(async () => {
      // Vacía y no borrada: así ConfigModule no la vuelve a cargar desde un .env local.
      process.env['GROQ_API_KEY'] = '';
      app = await bootstrap();
      prisma = app.get(PrismaService);
    });

    afterAll(async () => {
      await prisma.chat_sessions.deleteMany({
        where: { anon_token_hash: { in: anonTokens.map(hashAnonToken) } },
      });
      await app.close();
      if (originalKey === undefined) {
        delete process.env['GROQ_API_KEY'];
      } else {
        process.env['GROQ_API_KEY'] = originalKey;
      }
    });

    it('la app bootea, el chat devuelve el fallback y nunca sale a la red', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('sin red en los e2e'));

      const turn = await send(app);

      expectNoInternals(turn);
      expect(turn.reply).toBe(fallbackReply('es'));
      expect(fetchSpy).not.toHaveBeenCalled();
      await expect(storedErrorCode(prisma, turn.sessionToken)).resolves.toBe(
        'llm_unavailable',
      );
      await request(app.getHttpServer()).get('/public/doctors').expect(200);
    });
  });
});
