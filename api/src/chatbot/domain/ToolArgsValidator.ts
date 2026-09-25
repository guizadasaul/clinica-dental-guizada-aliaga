export type ToolArgsValidation<T> =
  | { ok: true; value: T }
  | { ok: false; fields: string[] };

/**
 * Valida los argumentos que generó el LLM contra el DTO de la tool. Tiene
 * que rechazar cualquier propiedad no declarada (así un patientId inyectado
 * en una tool "my" se rechaza, no se ignora en silencio). `fields` son solo
 * nombres de propiedad — nunca los valores recibidos.
 */
export interface ToolArgsValidator {
  validate<T extends object>(
    dtoClass: new () => T,
    plain: Record<string, unknown>,
  ): Promise<ToolArgsValidation<T>>;
}

export const ToolArgsValidator = Symbol('ToolArgsValidator');
