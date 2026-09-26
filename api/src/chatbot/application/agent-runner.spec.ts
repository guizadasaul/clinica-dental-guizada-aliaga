import { Logger } from '@nestjs/common';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import type { ChatActor } from '../domain/ChatActor';
import {
  LlmInvalidResponseError,
  LlmRateLimitedError,
  LlmUnavailableError,
} from '../domain/LlmProvider';
import type { LlmMessage, LlmToolCall } from '../domain/LlmProvider';
import type {
  ToolExecutionPort,
  ToolExecutionResult,
} from '../domain/ToolExecution';
import { AgentRunner } from './agent-runner';
import { fallbackReply } from './fallback-reply';
import {
  FakeLlmProvider,
  textResponse,
  toolCallResponse,
} from './testing/fake-llm.provider';

const patient: ChatActor = {
  kind: 'user',
  userId: 'user-1',
  role: UserRole.PATIENT,
  patientId: 'patient-1',
};

const HISTORY: LlmMessage[] = [{ role: 'user', content: '¿cuánto debo?' }];

const TOOL_DEFINITIONS = [
  { name: 'get_my_balance', description: 'saldo', parameters: {} },
];

function toolsPort(
  execute: (call: LlmToolCall) => ToolExecutionResult = (call) => ({
    toolName: call.name,
    status: 'ok',
    content: JSON.stringify({ data: { tool: call.name } }),
    links: [],
  }),
) {
  const port = {
    definitionsFor: jest.fn(() => TOOL_DEFINITIONS),
    execute: jest.fn((_actor: ChatActor, call: LlmToolCall) =>
      Promise.resolve(execute(call)),
    ),
  };
  return port as typeof port & ToolExecutionPort;
}

function run(
  llm: FakeLlmProvider,
  tools = toolsPort(),
  input: Partial<Parameters<AgentRunner['run']>[0]> = {},
) {
  return new AgentRunner(llm, tools).run({
    actor: patient,
    system: 'sistema',
    history: HISTORY,
    ...input,
  });
}

describe('AgentRunner', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['CHAT_MAX_TOOL_ITERATIONS'];
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('devuelve la respuesta directa del modelo cuando no pide tools', async () => {
    const llm = new FakeLlmProvider([
      textResponse('  Hola, ¿en qué te ayudo?  '),
    ]);

    const result = await run(llm);

    expect(result).toMatchObject({
      reply: 'Hola, ¿en qué te ayudo?',
      toolNames: [],
      iterations: 0,
      errorCode: null,
      usage: { promptTokens: 100, completionTokens: 10 },
    });
    expect(llm.requests[0]).toMatchObject({
      system: 'sistema',
      messages: HISTORY,
      tools: TOOL_DEFINITIONS,
    });
  });

  it('le ofrece al modelo solo las tools que el puerto permite para el actor', async () => {
    const tools = toolsPort();
    await run(new FakeLlmProvider([textResponse('ok')]), tools);

    expect(tools.definitionsFor).toHaveBeenCalledWith(patient);
  });

  it('le pasa a cada tool la identidad de auditoría y registra su resultado', async () => {
    const audit = {
      requestId: 'req-1',
      actor: 'user:user-1',
      role: 'patient' as const,
    };
    const llm = new FakeLlmProvider([
      toolCallResponse({ id: 'c1', name: 'get_clinic_financial_report' }),
      textResponse('No puedo ver eso'),
    ]);
    const tools = toolsPort((call) => ({
      toolName: call.name,
      status: 'denied',
      content: '{"error":"not_allowed"}',
      links: [],
    }));

    const result = await run(llm, tools, { audit });

    expect(tools.execute).toHaveBeenCalledWith(
      patient,
      expect.objectContaining({ name: 'get_clinic_financial_report' }),
      audit,
    );
    expect(result.toolCalls).toEqual([
      {
        name: 'get_clinic_financial_report',
        status: 'denied',
        ms: expect.any(Number) as unknown,
      },
    ]);
  });

  it('ejecuta una tool, le devuelve el resultado al modelo y responde', async () => {
    const llm = new FakeLlmProvider([
      toolCallResponse({ id: 'c1', name: 'get_my_balance' }),
      textResponse('Debés Bs. 150'),
    ]);
    const tools = toolsPort();

    const result = await run(llm, tools);

    expect(result.reply).toBe('Debés Bs. 150');
    expect(result.toolNames).toEqual(['get_my_balance']);
    expect(result.iterations).toBe(1);
    expect(result.usage).toEqual({ promptTokens: 200, completionTokens: 20 });
    expect(tools.execute).toHaveBeenCalledWith(
      patient,
      { id: 'c1', name: 'get_my_balance', argumentsJson: '{}' },
      undefined,
    );
    expect(result.toolCalls).toEqual([
      {
        name: 'get_my_balance',
        status: 'ok',
        ms: expect.any(Number) as unknown,
      },
    ]);
    expect(llm.requests[1].messages).toEqual([
      ...HISTORY,
      {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: 'c1', name: 'get_my_balance', argumentsJson: '{}' }],
      },
      {
        role: 'tool',
        toolCallId: 'c1',
        content: JSON.stringify({ data: { tool: 'get_my_balance' } }),
      },
    ]);
  });

  it('soporta varias iteraciones de tools', async () => {
    const llm = new FakeLlmProvider([
      toolCallResponse({ name: 'list_doctors' }),
      toolCallResponse({ name: 'get_available_slots' }),
      textResponse('Hay horarios el martes'),
    ]);

    const result = await run(llm);

    expect(result.toolNames).toEqual(['list_doctors', 'get_available_slots']);
    expect(result.iterations).toBe(2);
    expect(result.reply).toBe('Hay horarios el martes');
  });

  it('corta un modelo que nunca deja de pedir tools y fuerza la respuesta sin tools', async () => {
    const llm = new FakeLlmProvider([
      toolCallResponse({ name: 'get_faq' }),
      toolCallResponse({ name: 'get_faq' }),
      toolCallResponse({ name: 'get_faq' }),
      toolCallResponse({ name: 'get_faq' }),
      textResponse('Respuesta final'),
    ]);

    const result = await run(llm);

    expect(result.iterations).toBe(4);
    expect(result.reply).toBe('Respuesta final');
    expect(llm.requests).toHaveLength(5);
    expect(llm.requests[4].tools).toEqual([]);
  });

  it('respeta CHAT_MAX_TOOL_ITERATIONS', async () => {
    process.env['CHAT_MAX_TOOL_ITERATIONS'] = '1';
    const llm = new FakeLlmProvider([
      toolCallResponse({ name: 'get_faq' }),
      textResponse('fin'),
    ]);

    const result = await run(llm);

    expect(result.iterations).toBe(1);
    expect(llm.requests[1].tools).toEqual([]);
  });

  it('ejecuta como máximo 3 tool calls por iteración y responde error al resto', async () => {
    const llm = new FakeLlmProvider([
      toolCallResponse(
        { id: 'a', name: 'get_faq' },
        { id: 'b', name: 'list_doctors' },
        { id: 'c', name: 'list_services' },
        { id: 'd', name: 'get_clinic_info' },
      ),
      textResponse('listo'),
    ]);
    const tools = toolsPort();

    const result = await run(llm, tools);

    expect(tools.execute).toHaveBeenCalledTimes(3);
    expect(result.toolNames).toEqual([
      'get_faq',
      'list_doctors',
      'list_services',
    ]);
    const toolMessages = llm.requests[1].messages.filter(
      (m) => m.role === 'tool',
    );
    expect(toolMessages).toHaveLength(4);
    expect(toolMessages[3]).toEqual({
      role: 'tool',
      toolCallId: 'd',
      content: JSON.stringify({ error: 'too_many_tool_calls' }),
    });
  });

  it('le pasa al modelo el resultado de una tool denegada sin cortar el turno', async () => {
    const llm = new FakeLlmProvider([
      toolCallResponse({ name: 'get_clinic_financial_report' }),
      textResponse('No puedo consultar eso'),
    ]);
    const tools = toolsPort((call) => ({
      toolName: call.name,
      status: 'denied',
      content: JSON.stringify({ error: 'not_allowed' }),
      links: [],
    }));

    const result = await run(llm, tools);

    expect(result.reply).toBe('No puedo consultar eso');
    expect(result.errorCode).toBeNull();
  });

  it.each([
    [new LlmUnavailableError(), 'llm_unavailable'],
    [new LlmRateLimitedError(), 'llm_rate_limited'],
    [new LlmInvalidResponseError(), 'llm_invalid_response'],
  ])('ante %p responde el fallback con el código %s', async (error, code) => {
    const result = await run(new FakeLlmProvider([error]));

    expect(result.reply).toBe(fallbackReply('es'));
    expect(result.errorCode).toBe(code);
  });

  it('usa el fallback en el idioma pedido', async () => {
    const result = await run(
      new FakeLlmProvider([new LlmUnavailableError()]),
      toolsPort(),
      {
        locale: 'en',
      },
    );

    expect(result.reply).toBe(fallbackReply('en'));
  });

  it('un error inesperado también termina en el fallback, sin exponer el detalle', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    const result = await run(
      new FakeLlmProvider([new Error('boom: stack interno')]),
    );

    expect(result.reply).toBe(fallbackReply('es'));
    expect(result.reply).not.toContain('boom');
    expect(result.errorCode).toBe('internal_error');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('conserva las tools ya usadas cuando el modelo falla a mitad de camino', async () => {
    const llm = new FakeLlmProvider([
      toolCallResponse({ name: 'get_my_balance' }),
      new LlmUnavailableError(),
    ]);

    const result = await run(llm);

    expect(result.toolNames).toEqual(['get_my_balance']);
    expect(result.errorCode).toBe('llm_unavailable');
  });

  it.each([null, '', '   '])(
    'una respuesta vacía (%p) termina en el fallback',
    async (content) => {
      const result = await run(new FakeLlmProvider([textResponse(content)]));

      expect(result.reply).toBe(fallbackReply('es'));
      expect(result.errorCode).toBe('empty_response');
    },
  );

  it('no suma tokens cuando el proveedor no informa usage', async () => {
    const llm = new FakeLlmProvider([{ ...textResponse('hola'), usage: null }]);

    const result = await run(llm);

    expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
    expect(result.llmLatencyMs).toBeGreaterThanOrEqual(0);
  });

  describe('links', () => {
    const BOOKING_URL =
      'http://localhost:4200/reservar?slot=2026-09-26T14%3A00%3A00.000Z&doctorId=ac984e91-3391-4729-93e8-a89a495b7053';

    function bookingPort() {
      return toolsPort((call) => ({
        toolName: call.name,
        status: 'ok',
        content: JSON.stringify({ date: '2026-09-26', time: '10:00' }),
        links:
          call.name === 'get_booking_link'
            ? [
                {
                  label: 'Reservar el 2026-09-26 a las 10:00',
                  url: BOOKING_URL,
                },
              ]
            : [],
      }));
    }

    it('devuelve los links de las tools aparte del texto, sin repetir', async () => {
      const llm = new FakeLlmProvider([
        toolCallResponse({ name: 'get_booking_link' }),
        toolCallResponse({ name: 'get_booking_link' }),
        textResponse('Listo, te dejo el link para reservar.'),
      ]);

      const result = await run(llm, bookingPort());

      expect(result.reply).toBe('Listo, te dejo el link para reservar.');
      expect(result.links).toEqual([
        { label: 'Reservar el 2026-09-26 a las 10:00', url: BOOKING_URL },
      ]);
    });

    it('saca del texto un link de reserva recortado por el modelo (lo que pasó en vivo)', async () => {
      const llm = new FakeLlmProvider([
        toolCallResponse({ name: 'get_booking_link' }),
        textResponse(
          'Puedes reservar a las 10:00 en el siguiente enlace: http://localhost:4200/reservar?slot=2026-09-26T14:00:00.000Z&doctorId=ac984e1...\nCualquier duda, avísame.',
        ),
      ]);

      const result = await run(llm, bookingPort());

      expect(result.reply).toBe(
        'Puedes reservar a las 10:00 en el siguiente enlace:\nCualquier duda, avísame.',
      );
      expect(result.reply).not.toContain('/reservar');
      expect(result.links).toHaveLength(1);
    });

    it('si la respuesta era solo el link, contesta una frase corta y conserva el link', async () => {
      const llm = new FakeLlmProvider([
        toolCallResponse({ name: 'get_booking_link' }),
        textResponse(BOOKING_URL),
      ]);

      const result = await run(llm, bookingPort(), { locale: 'en' });

      expect(result.reply).toBe('Here is the link below.');
      expect(result.errorCode).toBeNull();
      expect(result.links).toHaveLength(1);
    });

    it('con fallback no devuelve links', async () => {
      const llm = new FakeLlmProvider([
        toolCallResponse({ name: 'get_booking_link' }),
        new LlmUnavailableError(),
      ]);

      const result = await run(llm, bookingPort());

      expect(result.errorCode).toBe('llm_unavailable');
      expect(result.links).toEqual([]);
    });
  });
});
