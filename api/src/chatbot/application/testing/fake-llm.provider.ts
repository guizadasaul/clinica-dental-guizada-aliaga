import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmToolCall,
} from '../../domain/LlmProvider';

/** Un paso del guion: una respuesta, o un error a lanzar en esa llamada. */
export type FakeLlmStep = LlmResponse | Error;

export function textResponse(content: string | null): LlmResponse {
  return {
    content,
    toolCalls: [],
    usage: { promptTokens: 100, completionTokens: 10 },
    finishReason: 'stop',
  };
}

export function toolCallResponse(
  ...calls: Array<Pick<LlmToolCall, 'name'> & Partial<LlmToolCall>>
): LlmResponse {
  return {
    content: null,
    toolCalls: calls.map((call, index) => ({
      id: call.id ?? `call_${index + 1}`,
      name: call.name,
      argumentsJson: call.argumentsJson ?? '{}',
    })),
    usage: { promptTokens: 100, completionTokens: 10 },
    finishReason: 'tool_calls',
  };
}

/**
 * LlmProvider guionado para tests (CLI-85; reutilizable en los e2e de
 * CLI-95/96): devuelve los pasos en orden y guarda cada request recibido,
 * para poder afirmar qué tools se le ofrecieron al "modelo" y qué historial
 * vio. Cuando el guion se agota, repite el último paso (así se simula un
 * modelo que nunca deja de pedir tools).
 */
export class FakeLlmProvider implements LlmProvider {
  readonly requests: LlmRequest[] = [];
  private index = 0;

  constructor(private readonly steps: FakeLlmStep[]) {}

  chat(request: LlmRequest): Promise<LlmResponse> {
    // Copia del historial: el agente sigue agregando mensajes al mismo array.
    this.requests.push({ ...request, messages: [...request.messages] });
    const step = this.steps[Math.min(this.index, this.steps.length - 1)];
    this.index++;
    return step instanceof Error ? Promise.reject(step) : Promise.resolve(step);
  }
}
