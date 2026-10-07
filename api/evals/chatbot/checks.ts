/**
 * Chequeos deterministas de una respuesta del chatbot (CLI-232). Son puros:
 * reciben el texto y lo que se espera del caso, y devuelven qué falló. El
 * juez LLM (judge.ts) mide lo que no se puede chequear con reglas (calidez,
 * claridad); esto mide lo que sí, sin gastar tokens.
 */

export interface CheckFailure {
  check: string;
  detail: string;
}

/**
 * Formas de voseo sin ambigüedad: la misma lista que
 * scripts/check-neutral-spanish.sh (CLI-175), que revisa el código; esta
 * revisa lo que escribe el modelo.
 */
const VOSEO_FORMS = [
  'Reservá',
  'Elegí',
  'Probá',
  'Escaneá',
  'Tocá',
  'Ingresá',
  'Completá',
  'Revisá',
  'Intentá',
  'Esperá',
  'Volvé',
  'Hacé',
  'Mirá',
  'Usá',
  'Cargá',
  'Seleccioná',
  'Confirmá',
  'Guardá',
  'Escribí',
  'Agregá',
  'Buscá',
  'Creá',
  'Verificá',
  'Solicitá',
  'Pedí',
  'Iniciá',
  'Generá',
  'Explicá',
  'Describí',
  'Dejá',
  'Definí',
  'Cerrá',
  'Cancelá',
  'Apretá',
  'Actualizá',
  'Accedé',
  'Copiá',
  'Pegá',
  'Contanos',
  'Dejanos',
  'Escribinos',
  'Contactanos',
  'Encontranos',
  'Llamanos',
  'Sumate',
  'Unite',
  'Registrate',
  'Pedile',
  'Mostrale',
  'Verificalo',
  'Dejalo',
  'Buscalo',
  'Buscala',
  'podés',
  'tenés',
  'querés',
  'sabés',
  'preferís',
  'llevás',
  'usás',
  'necesitás',
  'acá',
  'turno',
  'turnos',
];

/** Letras con tilde incluidas: \b de JS no las considera parte de una palabra. */
const WORD = 'A-Za-z0-9áéíóúÁÉÍÓÚñÑüÜ';

function wordRegex(words: string[], flags = 'i'): RegExp {
  return new RegExp(
    `(^|[^${WORD}])(${words.join('|')})(?=[^${WORD}]|$)`,
    flags,
  );
}

const VOSEO = wordRegex(VOSEO_FORMS);

/**
 * "Un momento, déjame revisar": el modelo anuncia que va a consultar en vez
 * de consultar y responder en el mismo turno. Es justo lo que el usuario
 * pidió evitar (todo en una sola respuesta).
 */
const DEFERRAL = [
  /\bun momento\b/i,
  /\bdame un (momento|segundo)\b/i,
  /\bd[ée]jame (revisar|consultar|verificar|buscar|ver)\b/i,
  /\bpermíteme (revisar|consultar|verificar|buscar)\b/i,
  /\b(voy|vamos) a (revisar|consultar|verificar|buscar)\b/i,
  /\bte (aviso|confirmo|escribo) (en breve|enseguida|luego|más tarde)\b/i,
  /\ben breve te\b/i,
];

const URL = /(https?:\/\/|www\.)\S+/i;
const MARKDOWN = [
  /\*\*[^*]+\*\*/, // **negrita**
  /(^|\n)#{1,6}\s/, // # título
  /\[[^\]]+\]\([^)]+\)/, // [texto](link)
  /(^|\n)\s*\|.*\|\s*(\n|$)/, // | tabla |
  /`[^`]+`/, // `código`
];
const EMOJI = /\p{Extended_Pictographic}/u;

/** Tope de largo por respuesta (el prompt pide ~120 palabras salvo detalle). */
export const MAX_REPLY_WORDS = 180;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Normaliza montos para comparar: "Bs. 1.050,00", "1,050", "1 050" y "1050"
 * quedan como "1050". Solo toca los separadores de miles/decimales entre dígitos.
 */
export function normalizeAmounts(text: string): string {
  return text
    .replace(/(\d)[.,\s\u00a0\u202f](\d{3})(?!\d)/g, '$1$2')
    .replace(/(\d)[.,]00(?!\d)/g, '$1');
}

/** Sin tildes ni mayúsculas, para que "Lucía" y "lucia" coincidan. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Para comparar: sin tildes, mayúsculas, formato de montos ni espacios. */
function comparable(text: string): string {
  return fold(normalizeAmounts(text)).replace(/\s+/g, '');
}

function mentions(reply: string, expected: string): boolean {
  return comparable(reply).includes(comparable(expected));
}

export interface ReplyExpectations {
  /** Cada string debe aparecer (sin importar tildes, mayúsculas ni formato de montos). */
  mustMention?: string[];
  /** Ninguno debe aparecer: datos de otra persona, consejos médicos, etc. */
  mustNotMention?: string[];
  /** Al menos uno de cada grupo: para lo que el modelo puede decir de varias formas. */
  mustMentionAny?: string[][];
}

/** Reglas de estilo que aplican a toda respuesta, más lo propio del caso. */
export function checkReply(
  reply: string,
  expected: ReplyExpectations = {},
): CheckFailure[] {
  const failures: CheckFailure[] = [];
  const voseo = VOSEO.exec(reply);
  if (voseo) {
    failures.push({ check: 'neutral_spanish', detail: `"${voseo[2]}"` });
  }
  const url = URL.exec(reply);
  if (url) failures.push({ check: 'no_urls', detail: url[0] });
  const markdown = MARKDOWN.find((re) => re.test(reply));
  if (markdown) {
    failures.push({ check: 'plain_text', detail: `Markdown: ${markdown}` });
  }
  const emoji = EMOJI.exec(reply);
  if (emoji) failures.push({ check: 'no_emoji', detail: emoji[0] });
  const deferral = DEFERRAL.find((re) => re.test(reply));
  if (deferral) {
    failures.push({ check: 'single_reply', detail: `anuncia: ${deferral}` });
  }
  const count = words(reply);
  if (count > MAX_REPLY_WORDS) {
    failures.push({ check: 'length', detail: `${count} palabras` });
  }
  for (const text of expected.mustMention ?? []) {
    if (!mentions(reply, text)) {
      failures.push({ check: 'must_mention', detail: text });
    }
  }
  for (const group of expected.mustMentionAny ?? []) {
    if (!group.some((text) => mentions(reply, text))) {
      failures.push({ check: 'must_mention', detail: group.join(' | ') });
    }
  }
  for (const text of expected.mustNotMention ?? []) {
    if (mentions(reply, text)) {
      failures.push({ check: 'must_not_mention', detail: text });
    }
  }
  return failures;
}

export interface ToolExpectations {
  /**
   * Cada grupo es un "o": basta con que se haya llamado una de sus tools
   * (ej. [['get_my_balance', 'get_my_quotes']]). Todos los grupos deben
   * cumplirse.
   */
  expectTools?: string[][];
  /** Ninguna de estas tools debe haberse llamado. */
  forbidTools?: string[];
}

export function checkTools(
  called: string[],
  expected: ToolExpectations = {},
): CheckFailure[] {
  const failures: CheckFailure[] = [];
  for (const group of expected.expectTools ?? []) {
    if (!group.some((name) => called.includes(name))) {
      failures.push({
        check: 'expected_tool',
        detail: `${group.join(' | ')} (llamó: ${called.join(', ') || 'ninguna'})`,
      });
    }
  }
  for (const name of expected.forbidTools ?? []) {
    if (called.includes(name)) {
      failures.push({ check: 'forbidden_tool', detail: name });
    }
  }
  return failures;
}
