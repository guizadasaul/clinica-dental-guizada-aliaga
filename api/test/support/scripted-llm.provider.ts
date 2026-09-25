import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../src/chatbot/domain/LlmProvider';
import {
  FakeLlmProvider,
  type FakeLlmStep,
} from '../../src/chatbot/application/testing/fake-llm.provider';

/**
 * El LlmProvider se inyecta una sola vez al bootstrapear la app; este wrapper
 * deja cambiar el guion del FakeLlmProvider (CLI-85) antes de cada request.
 */
export class ScriptedLlmProvider implements LlmProvider {
  current = new FakeLlmProvider([]);

  script(steps: FakeLlmStep[]): FakeLlmProvider {
    this.current = new FakeLlmProvider(steps);
    return this.current;
  }

  chat(request: LlmRequest): Promise<LlmResponse> {
    return this.current.chat(request);
  }
}
