import { Logger } from '@nestjs/common';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import { chatAuditContext } from '../domain/ChatAudit';
import { ChatAuditLogger } from './chat-audit.logger';

function lastJson(spy: jest.SpyInstance): Record<string, unknown> {
  const calls = spy.mock.calls as unknown[][];
  return JSON.parse(calls.at(-1)![0] as string) as Record<string, unknown>;
}

describe('chatAuditContext', () => {
  it('identifica al usuario por users.id y con su rol', () => {
    expect(
      chatAuditContext(
        'req-1',
        { kind: 'user', userId: 'u-1', role: UserRole.ADMIN, patientId: null },
        null,
      ),
    ).toEqual({ requestId: 'req-1', actor: 'user:u-1', role: 'admin' });
  });

  it('identifica al visitante solo por un prefijo del hash de su token', () => {
    expect(
      chatAuditContext(null, { kind: 'anonymous' }, 'abcdef0123456789'),
    ).toEqual({ requestId: null, actor: 'anon:abcdef01', role: 'anonymous' });
    expect(chatAuditContext(null, { kind: 'anonymous' }, null).actor).toBe(
      'anon:new',
    );
  });
});

describe('ChatAuditLogger', () => {
  const context = {
    requestId: 'req-1',
    actor: 'user:u-1',
    role: 'patient' as const,
  };
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('emite chat.turn como una línea JSON con exactamente los campos esperados', () => {
    const tools = [{ name: 'get_my_balance', status: 'ok' as const, ms: 42 }];
    new ChatAuditLogger().turn(context, {
      channel: 'web',
      tools,
      llmMs: 1830,
      totalMs: 2100,
      promptTokens: 1234,
      completionTokens: 210,
      iterations: 2,
      errorCode: null,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(lastJson(logSpy)).toEqual({
      event: 'chat.turn',
      requestId: 'req-1',
      ts: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
      channel: 'web',
      actor: 'user:u-1',
      role: 'patient',
      intent: 'tool',
      tools: [{ name: 'get_my_balance', status: 'ok', ms: 42 }],
      llmMs: 1830,
      totalMs: 2100,
      promptTokens: 1234,
      completionTokens: 210,
      iterations: 2,
      errorCode: null,
    });
  });

  it('un turno sin tools queda como intent no_tool', () => {
    new ChatAuditLogger().turn(context, {
      channel: 'web',
      tools: [],
      llmMs: 1,
      totalMs: 2,
      promptTokens: 3,
      completionTokens: 4,
      iterations: 0,
      errorCode: 'llm_unavailable',
    });

    expect(lastJson(logSpy)).toMatchObject({
      intent: 'no_tool',
      tools: [],
      errorCode: 'llm_unavailable',
    });
  });

  it('nunca copia campos que no están en la lista, aunque vengan en el input', () => {
    const sneaky = {
      channel: 'web' as const,
      tools: [
        { name: 'get_faq', status: 'ok' as const, ms: 1, args: 'SECRETO' },
      ],
      llmMs: 1,
      totalMs: 1,
      promptTokens: 1,
      completionTokens: 1,
      iterations: 1,
      errorCode: null,
      text: 'SECRETO',
      reply: 'SECRETO',
    };

    new ChatAuditLogger().turn(context, sneaky);

    expect((logSpy.mock.calls as string[][])[0][0]).not.toContain('SECRETO');
  });

  it('emite chat.security con warn, motivo y tool', () => {
    const audit = new ChatAuditLogger();
    audit.security(context, 'not_allowed', 'get_clinic_financial_report');
    expect(lastJson(warnSpy)).toEqual({
      event: 'chat.security',
      requestId: 'req-1',
      ts: expect.any(String) as unknown,
      actor: 'user:u-1',
      role: 'patient',
      reason: 'not_allowed',
      tool: 'get_clinic_financial_report',
    });

    audit.security(context, 'daily_quota_exceeded');
    expect(lastJson(warnSpy)).toMatchObject({
      reason: 'daily_quota_exceeded',
      tool: null,
    });
  });
});
