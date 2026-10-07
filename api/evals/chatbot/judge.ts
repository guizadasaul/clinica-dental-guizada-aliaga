import type { LlmProvider } from '../../src/chatbot/domain/LlmProvider';

/** Criterios del juez, de 1 (muy mal) a 5 (excelente). */
export const JUDGE_CRITERIA = {
  warmth: 'Calidez: suena humano, amable y cercano, no robótico ni seco.',
  clarity: 'Claridad: se entiende a la primera, ordenado, sin relleno.',
  singleReply:
    'Respuesta única: resuelve todo lo pedido en ese mensaje, sin anunciar que va a consultar ni dejar cosas para después, y pregunta solo si de verdad falta un dato.',
  faithfulness:
    'Fidelidad: todo dato concreto (fechas, montos, nombres) sale de las herramientas; no inventa nada ni promete lo que no puede hacer.',
} as const;

export type JudgeCriterion = keyof typeof JUDGE_CRITERIA;

export interface JudgeVerdict {
  scores: Record<JudgeCriterion, number>;
  comment: string;
}

export interface JudgedTurn {
  user: string;
  reply: string;
  /** Lo que devolvieron las tools en ese turno (lo que el modelo tenía a mano). */
  toolResults: { name: string; content: string }[];
}

const SYSTEM = `Eres un evaluador de calidad de un asistente virtual de una clínica dental de Bolivia. El asistente debe hablar en español neutro tuteando, en texto plano, ser cálido y breve, y responder todo en un solo mensaje.

Evalúa cada criterio de 1 a 5:
${Object.entries(JUDGE_CRITERIA)
  .map(([key, text]) => `- ${key}: ${text}`)
  .join('\n')}

Responde SOLO con un JSON, sin texto antes ni después:
{"warmth": n, "clarity": n, "singleReply": n, "faithfulness": n, "comment": "una o dos frases con lo más importante a mejorar"}`;

const TOOL_RESULT_MAX_CHARS = 1500;

function transcript(
  role: string,
  turns: JudgedTurn[],
  rubric?: string,
): string {
  const lines = [`Tipo de usuario: ${role}.`];
  if (rubric) lines.push(`Criterio propio de este caso: ${rubric}`);
  turns.forEach((turn, index) => {
    lines.push(`\n--- Turno ${index + 1} ---`, `Usuario: ${turn.user}`);
    for (const tool of turn.toolResults) {
      lines.push(
        `[Herramienta ${tool.name}] ${tool.content.slice(0, TOOL_RESULT_MAX_CHARS)}`,
      );
    }
    if (turn.toolResults.length === 0) lines.push('[Sin herramientas]');
    lines.push(`Asistente: ${turn.reply}`);
  });
  return lines.join('\n');
}

function clampScore(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : 0;
}

/** Extrae el primer objeto JSON del texto (el modelo a veces agrega texto). */
export function parseVerdict(content: string | null): JudgeVerdict | null {
  const match = /\{[\s\S]*\}/.exec(content ?? '');
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const scores = Object.fromEntries(
      Object.keys(JUDGE_CRITERIA).map((key) => [key, clampScore(raw[key])]),
    ) as Record<JudgeCriterion, number>;
    if (Object.values(scores).some((score) => score === 0)) return null;
    return {
      scores,
      comment: typeof raw.comment === 'string' ? raw.comment : '',
    };
  } catch {
    return null;
  }
}

/**
 * Juez LLM (CLI-232): mide lo que las reglas de checks.ts no pueden (calidez,
 * claridad). Usa el mismo LlmProvider que el chatbot; el modelo se elige con
 * EVAL_JUDGE_MODEL (el cupo de Groq es por modelo, así que usar otro modelo
 * para el juez no gasta el del chatbot).
 */
export async function judge(
  llm: LlmProvider,
  role: string,
  turns: JudgedTurn[],
  rubric?: string,
): Promise<JudgeVerdict | null> {
  const judgeModel = process.env['EVAL_JUDGE_MODEL'];
  const chatModel = process.env['GROQ_MODEL'];
  if (judgeModel) process.env['GROQ_MODEL'] = judgeModel;
  try {
    const response = await llm.chat({
      system: SYSTEM,
      messages: [{ role: 'user', content: transcript(role, turns, rubric) }],
      tools: [],
      maxCompletionTokens: 600,
    });
    return parseVerdict(response.content);
  } finally {
    if (chatModel === undefined) delete process.env['GROQ_MODEL'];
    else process.env['GROQ_MODEL'] = chatModel;
  }
}
