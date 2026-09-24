import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import type { ChatActor } from '../domain/ChatActor';
import type { ChatMessage } from '../domain/ChatMessage';
import type { ChatRepository } from '../domain/ChatRepository';
import type { ChatSession } from '../domain/ChatSession';
import type { AgentRunner, AgentRunResult } from './agent-runner';
import { ChatService, hashAnonToken } from './chat.service';

const NOW = new Date('2026-09-24T12:00:00Z');

/** Argumento `arg` de la llamada `call` a un mock, tipado. */
function callArg<T>(fn: jest.Mock, call: number, arg: number): T {
  return (fn.mock.calls as unknown[][])[call][arg] as T;
}

const patient: ChatActor = {
  kind: 'user',
  userId: 'user-1',
  role: UserRole.PATIENT,
  patientId: 'patient-1',
};
const anonymous: ChatActor = { kind: 'anonymous' };

function session(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    channel: 'web',
    createdAt: NOW,
    lastActivityAt: NOW,
    ...overrides,
  };
}

function message(
  role: 'user' | 'assistant',
  content: string,
  id = content,
): ChatMessage {
  return {
    id,
    sessionId: 'session-1',
    role,
    content,
    toolNames: [],
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    errorCode: null,
    createdAt: NOW,
  };
}

const AGENT_RESULT: AgentRunResult = {
  reply: 'Tu próxima cita es el martes',
  toolNames: ['get_my_next_appointment'],
  usage: { promptTokens: 900, completionTokens: 40 },
  llmLatencyMs: 1500,
  iterations: 1,
  errorCode: null,
};

describe('ChatService', () => {
  const originalEnv = process.env;
  const repo = {
    createSession: jest.fn(),
    findSessionForUser: jest.fn(),
    findSessionByAnonTokenHash: jest.fn(),
    appendMessage: jest.fn(),
    findRecentMessages: jest.fn(),
  };
  const agent = { run: jest.fn() };
  const promptBuilder = { build: jest.fn(() => 'SYSTEM') };
  const service = new ChatService(
    repo as unknown as ChatRepository,
    agent as unknown as AgentRunner,
    promptBuilder,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env['CHAT_CONTEXT_MESSAGES'];
    delete process.env['CHAT_CONTEXT_MAX_CHARS'];
    repo.appendMessage.mockResolvedValue(message('user', 'x'));
    repo.findRecentMessages.mockResolvedValue([message('user', 'hola')]);
    agent.run.mockResolvedValue(AGENT_RESULT);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('usuario autenticado', () => {
    it('crea una conversación nueva si no manda sessionId', async () => {
      repo.createSession.mockResolvedValue(session());

      const reply = await service.handleMessage({
        actor: patient,
        channel: 'web',
        text: 'hola',
      });

      expect(repo.createSession).toHaveBeenCalledWith({
        userId: 'user-1',
        channel: 'web',
        anonTokenHash: null,
      });
      expect(reply).toEqual({
        sessionId: 'session-1',
        anonToken: null,
        reply: 'Tu próxima cita es el martes',
      });
    });

    it('continúa su conversación buscándola por id y por dueño', async () => {
      repo.findSessionForUser.mockResolvedValue(session());

      await service.handleMessage({
        actor: patient,
        channel: 'web',
        sessionId: 'session-1',
        text: 'hola',
      });

      expect(repo.findSessionForUser).toHaveBeenCalledWith(
        'session-1',
        'user-1',
      );
      expect(repo.createSession).not.toHaveBeenCalled();
    });

    it('una conversación ajena o inexistente da 404 y no llama al modelo', async () => {
      repo.findSessionForUser.mockResolvedValue(null);

      await expect(
        service.handleMessage({
          actor: patient,
          channel: 'web',
          sessionId: 'session-de-otro',
          text: 'hola',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.appendMessage).not.toHaveBeenCalled();
      expect(agent.run).not.toHaveBeenCalled();
    });

    it('ignora un anonToken: un usuario solo accede a sus sesiones por id', async () => {
      repo.createSession.mockResolvedValue(session());

      await service.handleMessage({
        actor: patient,
        channel: 'web',
        anonToken: 'token-de-alguien',
        text: 'hola',
      });

      expect(repo.findSessionByAnonTokenHash).not.toHaveBeenCalled();
    });
  });

  describe('visitante anónimo', () => {
    it('sin token recibe uno nuevo generado por el servidor; solo se guarda el hash', async () => {
      repo.createSession.mockResolvedValue(session({ userId: null }));

      const reply = await service.handleMessage({
        actor: anonymous,
        channel: 'web',
        text: 'horarios?',
      });

      expect(reply.anonToken).toMatch(/^[\w-]{43}$/);
      const created = callArg<{ anonTokenHash: string }>(
        repo.createSession,
        0,
        0,
      );
      expect(created).toMatchObject({ userId: null, channel: 'web' });
      expect(created.anonTokenHash).toBe(hashAnonToken(reply.anonToken!));
      expect(created.anonTokenHash).not.toBe(reply.anonToken);
    });

    it('con un token válido continúa la misma conversación', async () => {
      repo.findSessionByAnonTokenHash.mockResolvedValue(
        session({ userId: null }),
      );

      const reply = await service.handleMessage({
        actor: anonymous,
        channel: 'web',
        anonToken: 'mi-token',
        text: 'hola',
      });

      expect(repo.findSessionByAnonTokenHash).toHaveBeenCalledWith(
        hashAnonToken('mi-token'),
      );
      expect(repo.createSession).not.toHaveBeenCalled();
      expect(reply.anonToken).toBe('mi-token');
    });

    it('con un token cuya conversación ya no existe emite uno nuevo', async () => {
      repo.findSessionByAnonTokenHash.mockResolvedValue(null);
      repo.createSession.mockResolvedValue(session({ userId: null }));

      const reply = await service.handleMessage({
        actor: anonymous,
        channel: 'web',
        anonToken: 'token-vencido',
        text: 'hola',
      });

      expect(reply.anonToken).not.toBe('token-vencido');
      expect(repo.createSession).toHaveBeenCalledTimes(1);
    });

    it('un sessionId no le da acceso a nada a un anónimo', async () => {
      repo.createSession.mockResolvedValue(session({ userId: null }));

      await service.handleMessage({
        actor: anonymous,
        channel: 'web',
        sessionId: 'session-1',
        text: 'hola',
      });

      expect(repo.findSessionForUser).not.toHaveBeenCalled();
    });
  });

  describe('turno', () => {
    beforeEach(() => {
      repo.findSessionForUser.mockResolvedValue(session());
    });

    it('persiste el mensaje del usuario antes de correr el agente y la respuesta después', async () => {
      await service.handleMessage({
        actor: patient,
        channel: 'whatsapp',
        sessionId: 'session-1',
        text: '¿cuándo es mi cita?',
        locale: 'es',
      });

      expect(repo.appendMessage).toHaveBeenNthCalledWith(1, 'session-1', {
        role: 'user',
        content: '¿cuándo es mi cita?',
      });
      expect(repo.appendMessage).toHaveBeenNthCalledWith(
        2,
        'session-1',
        expect.objectContaining({
          role: 'assistant',
          content: 'Tu próxima cita es el martes',
          toolNames: ['get_my_next_appointment'],
          promptTokens: 900,
          completionTokens: 40,
          errorCode: null,
        }),
      );
      const saved = callArg<{ latencyMs: number }>(repo.appendMessage, 1, 1);
      expect(saved.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('arma el prompt con el actor y le pasa al agente historial e idioma', async () => {
      await service.handleMessage({
        actor: patient,
        channel: 'web',
        sessionId: 'session-1',
        text: 'hola',
        locale: 'pt',
      });

      expect(promptBuilder.build).toHaveBeenCalledWith(
        patient,
        expect.any(Date),
      );
      expect(agent.run).toHaveBeenCalledWith({
        actor: patient,
        system: 'SYSTEM',
        history: [{ role: 'user', content: 'hola' }],
        locale: 'pt',
      });
    });

    it('guarda el código de error cuando el agente respondió con fallback', async () => {
      agent.run.mockResolvedValue({
        ...AGENT_RESULT,
        reply: 'fallback',
        toolNames: [],
        errorCode: 'llm_unavailable',
      });

      await service.handleMessage({
        actor: patient,
        channel: 'web',
        sessionId: 'session-1',
        text: 'hola',
      });

      expect(repo.appendMessage).toHaveBeenLastCalledWith(
        'session-1',
        expect.objectContaining({ errorCode: 'llm_unavailable' }),
      );
    });
  });

  describe('ventana de contexto', () => {
    beforeEach(() => {
      repo.findSessionForUser.mockResolvedValue(session());
    });

    async function historySent(): Promise<unknown> {
      await service.handleMessage({
        actor: patient,
        channel: 'web',
        sessionId: 'session-1',
        text: 'actual',
      });
      return callArg<{ history: unknown }>(agent.run, 0, 0).history;
    }

    it('pide por defecto los últimos 12 mensajes y los manda solo como user/assistant', async () => {
      repo.findRecentMessages.mockResolvedValue([
        message('user', 'anterior'),
        { ...message('assistant', 'respuesta'), toolNames: ['get_faq'] },
        message('user', 'actual'),
      ]);

      await expect(historySent()).resolves.toEqual([
        { role: 'user', content: 'anterior' },
        { role: 'assistant', content: 'respuesta' },
        { role: 'user', content: 'actual' },
      ]);
      expect(repo.findRecentMessages).toHaveBeenCalledWith('session-1', 12);
    });

    it('respeta CHAT_CONTEXT_MESSAGES', async () => {
      process.env['CHAT_CONTEXT_MESSAGES'] = '4';

      await historySent();

      expect(repo.findRecentMessages).toHaveBeenCalledWith('session-1', 4);
    });

    it('recorta desde el más viejo cuando se pasa de CHAT_CONTEXT_MAX_CHARS', async () => {
      process.env['CHAT_CONTEXT_MAX_CHARS'] = '25';
      repo.findRecentMessages.mockResolvedValue([
        message('user', 'a'.repeat(20), 'viejo'),
        message('assistant', 'b'.repeat(10), 'medio'),
        message('user', 'c'.repeat(10), 'actual'),
      ]);

      await expect(historySent()).resolves.toEqual([
        { role: 'assistant', content: 'b'.repeat(10) },
        { role: 'user', content: 'c'.repeat(10) },
      ]);
    });

    it('conserva siempre el mensaje actual aunque solo ya supere el tope', async () => {
      process.env['CHAT_CONTEXT_MAX_CHARS'] = '5';
      repo.findRecentMessages.mockResolvedValue([
        message('assistant', 'previo'),
        message('user', 'un mensaje largo'),
      ]);

      await expect(historySent()).resolves.toEqual([
        { role: 'user', content: 'un mensaje largo' },
      ]);
    });
  });
});
