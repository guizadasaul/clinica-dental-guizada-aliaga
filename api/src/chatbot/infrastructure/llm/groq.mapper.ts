import {
  LlmInvalidResponseError,
  type LlmFinishReason,
  type LlmMessage,
  type LlmRequest,
  type LlmResponse,
  type LlmToolCall,
} from '../../domain/LlmProvider';

/**
 * Traducción entre el DTO propio (domain/LlmProvider.ts) y el formato
 * compatible con OpenAI que usa Groq. Los tipos de Groq viven solo en esta
 * carpeta — nunca salen hacia application/ ni domain/.
 */

export type GroqReasoningEffort = 'low' | 'medium' | 'high';

export interface GroqRequestOptions {
  model: string;
  maxCompletionTokens: number;
  reasoningEffort: GroqReasoningEffort;
}

interface GroqToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type GroqMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface GroqChatRequestBody {
  model: string;
  messages: GroqMessage[];
  temperature: number;
  max_completion_tokens: number;
  reasoning_effort: GroqReasoningEffort;
  /** El razonamiento de gpt-oss no hace falta y puede repetir datos del usuario: no se pide. */
  include_reasoning: false;
  tools?: {
    type: 'function';
    function: { name: string; description: string; parameters: object };
  }[];
  tool_choice?: 'auto';
}

const TEMPERATURE = 0.2;

function toGroqMessage(message: LlmMessage): GroqMessage {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: message.content };
    case 'tool':
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
      };
    case 'assistant': {
      const toolCalls = message.toolCalls ?? [];
      return {
        role: 'assistant',
        content: message.content,
        ...(toolCalls.length > 0 && {
          tool_calls: toolCalls.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.name, arguments: call.argumentsJson },
          })),
        }),
      };
    }
  }
}

export function toGroqRequestBody(
  request: LlmRequest,
  options: GroqRequestOptions,
): GroqChatRequestBody {
  const hasTools = request.tools.length > 0;
  return {
    model: options.model,
    messages: [
      { role: 'system', content: request.system },
      ...request.messages.map(toGroqMessage),
    ],
    temperature: TEMPERATURE,
    max_completion_tokens:
      request.maxCompletionTokens ?? options.maxCompletionTokens,
    reasoning_effort: options.reasoningEffort,
    include_reasoning: false,
    // Sin tools no se manda ni `tools` ni `tool_choice`: el modelo solo
    // puede responder con texto (así se fuerza la respuesta final).
    ...(hasTools && {
      tools: request.tools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      tool_choice: 'auto' as const,
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toToolCall(raw: unknown): LlmToolCall {
  const fn = isRecord(raw) ? raw['function'] : undefined;
  if (
    !isRecord(raw) ||
    typeof raw['id'] !== 'string' ||
    !isRecord(fn) ||
    typeof fn['name'] !== 'string' ||
    fn['name'].length === 0
  ) {
    throw new LlmInvalidResponseError('tool_call sin id o sin nombre');
  }
  const args = fn['arguments'];
  return {
    id: raw['id'],
    name: fn['name'],
    // Normalmente llega como string; si algún día llega ya parseado, se
    // vuelve a serializar para que ToolExecutor siempre reciba texto.
    argumentsJson: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
  };
}

function toFinishReason(raw: unknown): LlmFinishReason {
  if (raw === 'stop' || raw === 'tool_calls' || raw === 'length') {
    return raw;
  }
  return 'other';
}

export function fromGroqResponseBody(body: unknown): LlmResponse {
  if (!isRecord(body)) {
    throw new LlmInvalidResponseError('Respuesta sin cuerpo');
  }
  const choices = body['choices'];
  const choice: unknown = Array.isArray(choices) ? choices[0] : undefined;
  const message = isRecord(choice) ? choice['message'] : undefined;
  if (!isRecord(choice) || !isRecord(message)) {
    throw new LlmInvalidResponseError('Respuesta sin choices');
  }

  const rawToolCalls = message['tool_calls'];
  const toolCalls = Array.isArray(rawToolCalls)
    ? rawToolCalls.map(toToolCall)
    : [];

  const usage = body['usage'];
  const hasUsage =
    isRecord(usage) &&
    typeof usage['prompt_tokens'] === 'number' &&
    typeof usage['completion_tokens'] === 'number';
  // Caché de prompt de Groq (prefijo repetido: system + tools): mitad de precio.
  const details = hasUsage ? usage['prompt_tokens_details'] : undefined;
  const cachedTokens = isRecord(details) ? details['cached_tokens'] : undefined;

  return {
    content: typeof message['content'] === 'string' ? message['content'] : null,
    toolCalls,
    usage: hasUsage
      ? {
          promptTokens: usage['prompt_tokens'] as number,
          completionTokens: usage['completion_tokens'] as number,
          ...(typeof cachedTokens === 'number' && {
            cachedPromptTokens: cachedTokens,
          }),
        }
      : null,
    finishReason: toFinishReason(choice['finish_reason']),
  };
}
