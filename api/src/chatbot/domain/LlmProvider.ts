import type { JsonSchema } from './ChatTool';

/**
 * Puerto hacia el modelo de lenguaje. Tipos propios, sin nada de Groq ni de
 * OpenAI: cambiar de proveedor (o usar un modelo local) es escribir otro
 * adaptador en infrastructure/, sin tocar el agente.
 */

export interface LlmToolCall {
  id: string;
  name: string;
  /** Tal cual lo generó el modelo, sin parsear — lo valida ToolExecutor. */
  argumentsJson: string;
}

export type LlmMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: LlmToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  /** Vacío = el modelo tiene que responder con texto, sin pedir tools. */
  tools: LlmToolDefinition[];
  maxCompletionTokens?: number;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export type LlmFinishReason = 'stop' | 'tool_calls' | 'length' | 'other';

export interface LlmResponse {
  content: string | null;
  toolCalls: LlmToolCall[];
  usage: LlmUsage | null;
  finishReason: LlmFinishReason;
}

export interface LlmProvider {
  chat(request: LlmRequest): Promise<LlmResponse>;
}

export const LlmProvider = Symbol('LlmProvider');

/** Timeout, error de red o 5xx del proveedor. */
export class LlmUnavailableError extends Error {
  constructor(message = 'El modelo de lenguaje no está disponible') {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

/** El proveedor rechazó el pedido por límite de uso (429). */
export class LlmRateLimitedError extends Error {
  constructor(message = 'Se alcanzó el límite de uso del modelo de lenguaje') {
    super(message);
    this.name = 'LlmRateLimitedError';
  }
}

/** La respuesta del proveedor no tiene la forma esperada. */
export class LlmInvalidResponseError extends Error {
  constructor(message = 'Respuesta inválida del modelo de lenguaje') {
    super(message);
    this.name = 'LlmInvalidResponseError';
  }
}
