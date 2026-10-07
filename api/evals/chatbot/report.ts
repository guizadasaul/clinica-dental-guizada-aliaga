import type { CheckFailure } from './checks';
import type { EvalRole } from './cases';
import { JUDGE_CRITERIA } from './judge';
import type { JudgeCriterion, JudgeVerdict } from './judge';

export interface TurnResult {
  user: string;
  reply: string;
  tools: string[];
  toolResults: { name: string; content: string }[];
  /** Código del agente si el turno terminó en fallback (ej. llm_rate_limited). */
  errorCode: string | null;
  failures: CheckFailure[];
}

export interface CaseResult {
  id: string;
  role: EvalRole;
  description: string;
  turns: TurnResult[];
  verdict: JudgeVerdict | null;
}

export interface RunSummary {
  startedAt: string;
  model: string;
  judgeModel: string | null;
  promptTokens: number;
  completionTokens: number;
  llmCalls: number;
  durationMs: number;
}

/** Un caso pasa si ningún turno falló un chequeo ni terminó en fallback. */
export function casePassed(result: CaseResult): boolean {
  return result.turns.every((t) => t.failures.length === 0 && !t.errorCode);
}

/** Cayó por la infraestructura (cupo de Groq, timeout), no por el comportamiento. */
export function caseErrored(result: CaseResult): boolean {
  return result.turns.some((t) => t.errorCode !== null);
}

function average(values: number[]): string {
  if (values.length === 0) return '—';
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
}

function judgeAverages(results: CaseResult[]): Record<JudgeCriterion, string> {
  const verdicts = results
    .map((r) => r.verdict)
    .filter((v): v is JudgeVerdict => v !== null);
  return Object.fromEntries(
    Object.keys(JUDGE_CRITERIA).map((key) => [
      key,
      average(verdicts.map((v) => v.scores[key as JudgeCriterion])),
    ]),
  ) as Record<JudgeCriterion, string>;
}

function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

export function renderMarkdown(
  summary: RunSummary,
  results: CaseResult[],
): string {
  const criteria = Object.keys(JUDGE_CRITERIA) as JudgeCriterion[];
  const passed = results.filter(casePassed).length;
  const errored = results.filter(caseErrored).length;
  const lines = [
    `# Evals del chatbot — ${summary.startedAt}`,
    '',
    `Modelo: ${summary.model}. Juez: ${summary.judgeModel ?? 'no se corrió'}.`,
    `Casos con todas las reglas OK: **${passed}/${results.length}**` +
      (errored ? ` (${errored} con error del proveedor, ver abajo)` : '') +
      '.',
    `Tokens: ${summary.promptTokens} de entrada + ${summary.completionTokens} de salida en ${summary.llmCalls} llamadas. Duración: ${Math.round(summary.durationMs / 1000)} s.`,
    '',
    `| Rol | Casos | Reglas OK | ${criteria.join(' | ')} |`,
    `|---|---|---|${criteria.map(() => '---').join('|')}|`,
  ];
  const roles = [...new Set(results.map((r) => r.role))];
  for (const role of [...roles, 'total']) {
    const subset =
      role === 'total' ? results : results.filter((r) => r.role === role);
    const averages = judgeAverages(subset);
    lines.push(
      `| ${role} | ${subset.length} | ${subset.filter(casePassed).length} | ${criteria.map((c) => averages[c]).join(' | ')} |`,
    );
  }

  lines.push('', '## Casos', '');
  for (const result of results) {
    const mark = casePassed(result) ? '✓' : '✗';
    const scores = result.verdict
      ? ` — juez ${criteria.map((c) => result.verdict!.scores[c]).join('/')}`
      : '';
    lines.push(
      `- ${mark} \`${result.id}\` (${result.role}): ${result.description}${scores}`,
    );
  }

  lines.push('', '## Conversaciones', '');
  for (const result of results) {
    lines.push(`### ${casePassed(result) ? '✓' : '✗'} ${result.id}`, '');
    if (result.verdict?.comment) {
      lines.push(`Juez: ${result.verdict.comment}`, '');
    }
    for (const turn of result.turns) {
      lines.push(`**Usuario:** ${turn.user}`, '');
      lines.push(`Tools: ${turn.tools.join(', ') || 'ninguna'}`, '');
      lines.push(quote(turn.reply), '');
      if (turn.errorCode)
        lines.push(`Error del agente: \`${turn.errorCode}\``, '');
      for (const failure of turn.failures) {
        lines.push(`- ✗ ${failure.check}: ${failure.detail}`);
      }
      if (turn.failures.length > 0) lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}
