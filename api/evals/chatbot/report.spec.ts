import { casePassed, caseErrored, renderMarkdown } from './report';
import type { CaseResult, TurnResult } from './report';

function turn(overrides: Partial<TurnResult> = {}): TurnResult {
  return {
    user: '¿cuánto debo?',
    reply: 'Tu saldo es Bs. 1050.',
    tools: ['get_my_balance'],
    toolResults: [],
    errorCode: null,
    failures: [],
    ...overrides,
  };
}

function result(id: string, turns: TurnResult[], verdict = null): CaseResult {
  return { id, role: 'patient', description: 'Saldo', turns, verdict };
}

const SUMMARY = {
  startedAt: '2026-10-07T00:00:00.000Z',
  model: 'openai/gpt-oss-120b',
  judgeModel: null,
  promptTokens: 3000,
  completionTokens: 100,
  llmCalls: 2,
  durationMs: 4000,
};

describe('reporte de los evals (CLI-232)', () => {
  it('un caso pasa solo si ningún turno falló ni terminó en fallback', () => {
    expect(casePassed(result('ok', [turn()]))).toBe(true);
    expect(
      casePassed(
        result('falla', [
          turn(),
          turn({ failures: [{ check: 'no_urls', detail: 'https://x' }] }),
        ]),
      ),
    ).toBe(false);
    const errored = result('cupo', [turn({ errorCode: 'llm_rate_limited' })]);
    expect(casePassed(errored)).toBe(false);
    expect(caseErrored(errored)).toBe(true);
  });

  it('el markdown resume por rol y muestra cada conversación con sus fallas', () => {
    const markdown = renderMarkdown(SUMMARY, [
      result('patient-balance', [turn()]),
      result('patient-visits', [
        turn({
          user: '¿falté a alguna?',
          reply: 'No tengo ese dato.',
          tools: [],
          failures: [{ check: 'expected_tool', detail: 'get_my_visits' }],
        }),
      ]),
    ]);
    expect(markdown).toContain('Casos con todas las reglas OK: **1/2**');
    expect(markdown).toContain('| patient | 2 | 1 |');
    expect(markdown).toContain('- ✓ `patient-balance`');
    expect(markdown).toContain('- ✗ `patient-visits`');
    expect(markdown).toContain('> No tengo ese dato.');
    expect(markdown).toContain('- ✗ expected_tool: get_my_visits');
  });
});
