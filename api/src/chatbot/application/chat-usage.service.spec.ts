import { UserRole } from '../../auth/domain/value-objects/UserRole';
import { BadRequestException } from '@nestjs/common';
import type { ChatRepository } from '../domain/ChatRepository';
import type { ChatTurnRecord } from '../domain/ChatUsage';
import { ChatUsageService } from './chat-usage.service';

function turn(overrides: Partial<ChatTurnRecord> = {}): ChatTurnRecord {
  return {
    createdAt: new Date('2026-09-10T15:00:00Z'),
    channel: 'web',
    role: UserRole.PATIENT,
    actorKey: 'user-1',
    promptTokens: 1000,
    completionTokens: 100,
    errorCode: null,
    deniedTools: 0,
    ...overrides,
  };
}

describe('ChatUsageService', () => {
  const originalEnv = process.env;
  const repo = { findAssistantTurnsBetween: jest.fn() };
  const service = new ChatUsageService(repo as unknown as ChatRepository);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env['LLM_PRICE_INPUT_PER_M'];
    delete process.env['LLM_PRICE_OUTPUT_PER_M'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('consulta el rango en días de Bolivia, con `to` inclusivo', async () => {
    repo.findAssistantTurnsBetween.mockResolvedValue([]);

    await service.getUsage('2026-09-01', '2026-09-30');

    expect(repo.findAssistantTurnsBetween).toHaveBeenCalledWith(
      new Date('2026-09-01T04:00:00Z'),
      new Date('2026-10-01T04:00:00Z'),
    );
  });

  it('agrupa por día, canal y rol, cuenta usuarios distintos y suma todo', async () => {
    repo.findAssistantTurnsBetween.mockResolvedValue([
      turn(),
      turn({
        actorKey: 'user-1',
        errorCode: 'llm_rate_limited',
        deniedTools: 1,
      }),
      turn({ actorKey: 'user-2' }),
      // 02:00 del 11 en UTC = 22:00 del 10 en Bolivia: cuenta para el 10.
      turn({
        createdAt: new Date('2026-09-11T02:00:00Z'),
        role: 'anonymous',
        actorKey: 'anon:s-1',
      }),
      turn({
        createdAt: new Date('2026-09-11T15:00:00Z'),
        role: UserRole.ADMIN,
        actorKey: 'admin-1',
      }),
    ]);

    const report = await service.getUsage('2026-09-01', '2026-09-30');

    expect(report.rows).toEqual([
      {
        date: '2026-09-10',
        channel: 'web',
        role: 'anonymous',
        turns: 1,
        users: 1,
        promptTokens: 1000,
        completionTokens: 100,
        errors: 0,
        deniedTools: 0,
      },
      {
        date: '2026-09-10',
        channel: 'web',
        role: 'patient',
        turns: 3,
        users: 2,
        promptTokens: 3000,
        completionTokens: 300,
        errors: 1,
        deniedTools: 1,
      },
      {
        date: '2026-09-11',
        channel: 'web',
        role: 'admin',
        turns: 1,
        users: 1,
        promptTokens: 1000,
        completionTokens: 100,
        errors: 0,
        deniedTools: 0,
      },
    ]);
    expect(report.totals).toEqual({
      turns: 5,
      promptTokens: 5000,
      completionTokens: 500,
      errors: 1,
      deniedTools: 1,
      // 5000 × 0.15/M + 500 × 0.60/M
      estimatedCostUsd: 0.00105,
    });
    expect(report.notes.join(' ')).toContain('retención');
  });

  it('usa los precios de env y descarta valores inválidos', async () => {
    repo.findAssistantTurnsBetween.mockResolvedValue([
      turn({ promptTokens: 1_000_000, completionTokens: 1_000_000 }),
    ]);
    process.env['LLM_PRICE_INPUT_PER_M'] = '1';
    process.env['LLM_PRICE_OUTPUT_PER_M'] = 'caro';

    const report = await service.getUsage('2026-09-10', '2026-09-10');

    expect(report.totals.estimatedCostUsd).toBe(1.6);
  });

  it.each([
    ['2026-09-30', '2026-09-01'],
    ['2026-01-01', '2026-09-01'],
    ['2026-02-31x', '2026-03-01'],
  ])('rechaza el rango %s → %s sin consultar', async (from, to) => {
    await expect(service.getUsage(from, to)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.findAssistantTurnsBetween).not.toHaveBeenCalled();
  });
});
