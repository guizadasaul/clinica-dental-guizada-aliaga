import { PrismaChatRepository } from './prisma-chat.repository';

const CREATED = new Date('2026-09-24T12:00:00Z');

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    user_id: 'user-1',
    channel: 'web',
    anon_token_hash: null,
    created_at: CREATED,
    last_activity_at: CREATED,
    ...overrides,
  };
}

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'message-1',
    session_id: 'session-1',
    role: 'user',
    content: 'hola',
    tool_names: [],
    latency_ms: null,
    prompt_tokens: null,
    completion_tokens: null,
    error_code: null,
    denied_tools: 0,
    created_at: CREATED,
    ...overrides,
  };
}

describe('PrismaChatRepository', () => {
  const chat_sessions = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  };
  const chat_messages = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };
  const transaction = jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
    fn({ chat_sessions, chat_messages }),
  );
  const repo = new PrismaChatRepository({
    chat_sessions,
    chat_messages,
    transaction,
  } as never);

  beforeEach(() => jest.clearAllMocks());

  it('createSession guarda dueño, canal y hash, y mapea al dominio', async () => {
    chat_sessions.create.mockResolvedValue(
      sessionRow({ user_id: null, anon_token_hash: 'h'.repeat(64) }),
    );

    await expect(
      repo.createSession({
        userId: null,
        channel: 'web',
        anonTokenHash: 'h'.repeat(64),
      }),
    ).resolves.toEqual({
      id: 'session-1',
      userId: null,
      channel: 'web',
      createdAt: CREATED,
      lastActivityAt: CREATED,
    });
    expect(chat_sessions.create).toHaveBeenCalledWith({
      data: { user_id: null, channel: 'web', anon_token_hash: 'h'.repeat(64) },
    });
  });

  it('findSessionForUser filtra por id Y por dueño en la misma consulta', async () => {
    chat_sessions.findFirst.mockResolvedValue(sessionRow());

    await expect(
      repo.findSessionForUser('session-1', 'user-1'),
    ).resolves.toMatchObject({
      id: 'session-1',
      userId: 'user-1',
    });
    expect(chat_sessions.findFirst).toHaveBeenCalledWith({
      where: { id: 'session-1', user_id: 'user-1' },
    });
  });

  it('findSessionForUser devuelve null si la sesión es de otro usuario', async () => {
    chat_sessions.findFirst.mockResolvedValue(null);

    await expect(
      repo.findSessionForUser('session-1', 'otro'),
    ).resolves.toBeNull();
  });

  it('findSessionByAnonTokenHash busca por el hash', async () => {
    chat_sessions.findUnique.mockResolvedValueOnce(
      sessionRow({ user_id: null }),
    );
    chat_sessions.findUnique.mockResolvedValueOnce(null);

    await expect(repo.findSessionByAnonTokenHash('abc')).resolves.toMatchObject(
      {
        userId: null,
      },
    );
    await expect(repo.findSessionByAnonTokenHash('xyz')).resolves.toBeNull();
    expect(chat_sessions.findUnique).toHaveBeenCalledWith({
      where: { anon_token_hash: 'abc' },
    });
  });

  it('appendMessage guarda el mensaje y actualiza la actividad de la sesión en una transacción', async () => {
    chat_messages.create.mockResolvedValue(
      messageRow({
        role: 'assistant',
        content: 'Tu próxima cita es el martes',
        tool_names: ['get_my_next_appointment'],
        latency_ms: 1800,
        prompt_tokens: 900,
        completion_tokens: 40,
      }),
    );

    const message = await repo.appendMessage('session-1', {
      role: 'assistant',
      content: 'Tu próxima cita es el martes',
      toolNames: ['get_my_next_appointment'],
      latencyMs: 1800,
      promptTokens: 900,
      completionTokens: 40,
      deniedTools: 1,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(chat_messages.create).toHaveBeenCalledWith({
      data: {
        session_id: 'session-1',
        role: 'assistant',
        content: 'Tu próxima cita es el martes',
        tool_names: ['get_my_next_appointment'],
        latency_ms: 1800,
        prompt_tokens: 900,
        completion_tokens: 40,
        error_code: null,
        denied_tools: 1,
      },
    });
    expect(chat_sessions.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { last_activity_at: CREATED },
    });
    expect(message).toEqual({
      id: 'message-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: 'Tu próxima cita es el martes',
      toolNames: ['get_my_next_appointment'],
      latencyMs: 1800,
      promptTokens: 900,
      completionTokens: 40,
      errorCode: null,
      createdAt: CREATED,
    });
  });

  it('appendMessage usa defaults vacíos para la metadata opcional', async () => {
    chat_messages.create.mockResolvedValue(messageRow());

    await repo.appendMessage('session-1', { role: 'user', content: 'hola' });

    expect(chat_messages.create).toHaveBeenCalledWith({
      data: {
        session_id: 'session-1',
        role: 'user',
        content: 'hola',
        tool_names: [],
        latency_ms: null,
        prompt_tokens: null,
        completion_tokens: null,
        error_code: null,
        denied_tools: 0,
      },
    });
  });

  it('findAssistantTurnsBetween trae solo turnos del assistant en el rango, con canal y rol', async () => {
    const from = new Date('2026-09-01T04:00:00Z');
    const to = new Date('2026-09-02T04:00:00Z');
    chat_messages.findMany.mockResolvedValue([
      {
        created_at: CREATED,
        prompt_tokens: 900,
        completion_tokens: 40,
        error_code: null,
        denied_tools: 1,
        chat_sessions: {
          id: 'session-1',
          channel: 'web',
          user_id: 'user-1',
          users: { role: 'patient' },
        },
      },
      {
        created_at: CREATED,
        prompt_tokens: null,
        completion_tokens: null,
        error_code: 'llm_unavailable',
        denied_tools: 0,
        chat_sessions: {
          id: 'session-2',
          channel: 'web',
          user_id: null,
          users: null,
        },
      },
    ]);

    const turns = await repo.findAssistantTurnsBetween(from, to);

    expect(chat_messages.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'assistant', created_at: { gte: from, lt: to } },
      }),
    );
    expect(turns).toEqual([
      {
        createdAt: CREATED,
        channel: 'web',
        role: 'patient',
        actorKey: 'user-1',
        promptTokens: 900,
        completionTokens: 40,
        errorCode: null,
        deniedTools: 1,
      },
      {
        createdAt: CREATED,
        channel: 'web',
        role: 'anonymous',
        actorKey: 'anon:session-2',
        promptTokens: 0,
        completionTokens: 0,
        errorCode: 'llm_unavailable',
        deniedTools: 0,
      },
    ]);
  });

  it('findRecentMessages pide los más nuevos y los devuelve en orden cronológico', async () => {
    chat_messages.findMany.mockResolvedValue([
      messageRow({ id: 'm3', content: 'tercero' }),
      messageRow({ id: 'm2', content: 'segundo' }),
    ]);

    const messages = await repo.findRecentMessages('session-1', 2);

    expect(chat_messages.findMany).toHaveBeenCalledWith({
      where: { session_id: 'session-1' },
      orderBy: { created_at: 'desc' },
      take: 2,
    });
    expect(messages.map((m) => m.id)).toEqual(['m2', 'm3']);
  });

  it('countUserMessagesSince cuenta solo mensajes del usuario en sus sesiones', async () => {
    chat_messages.count.mockResolvedValue(7);
    const since = new Date('2026-09-23T12:00:00Z');

    await expect(repo.countUserMessagesSince('user-1', since)).resolves.toBe(7);
    expect(chat_messages.count).toHaveBeenCalledWith({
      where: {
        role: 'user',
        created_at: { gte: since },
        chat_sessions: { user_id: 'user-1' },
      },
    });
  });

  it('countAnonMessagesSince cuenta por el hash del token anónimo', async () => {
    chat_messages.count.mockResolvedValue(3);
    const since = new Date('2026-09-23T12:00:00Z');

    await expect(repo.countAnonMessagesSince('abc', since)).resolves.toBe(3);
    expect(chat_messages.count).toHaveBeenCalledWith({
      where: {
        role: 'user',
        created_at: { gte: since },
        chat_sessions: { anon_token_hash: 'abc' },
      },
    });
  });

  it('deleteSessionForUser solo borra la sesión si es del usuario', async () => {
    chat_sessions.deleteMany.mockResolvedValueOnce({ count: 1 });
    chat_sessions.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      repo.deleteSessionForUser('session-1', 'user-1'),
    ).resolves.toBe(true);
    await expect(repo.deleteSessionForUser('session-1', 'otro')).resolves.toBe(
      false,
    );
    expect(chat_sessions.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'session-1', user_id: 'user-1' },
    });
    expect(chat_sessions.deleteMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'session-1', user_id: 'otro' },
    });
  });

  it('deleteAllForUser borra todas las sesiones del usuario', async () => {
    chat_sessions.deleteMany.mockResolvedValue({ count: 4 });

    await expect(repo.deleteAllForUser('user-1')).resolves.toBe(4);
    expect(chat_sessions.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
    });
  });

  it('deleteInactiveSince borra las sesiones sin actividad desde la fecha', async () => {
    chat_sessions.deleteMany.mockResolvedValue({ count: 2 });
    const cutoff = new Date('2026-08-25T12:00:00Z');

    await expect(repo.deleteInactiveSince(cutoff)).resolves.toBe(2);
    expect(chat_sessions.deleteMany).toHaveBeenCalledWith({
      where: { last_activity_at: { lt: cutoff } },
    });
  });
});
