import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ChatActor } from '../domain/ChatActor';
import {
  LlmInvalidResponseError,
  LlmProvider,
  LlmRateLimitedError,
  LlmUnavailableError,
} from '../domain/LlmProvider';
import type {
  LlmMessage,
  LlmProvider as ILlmProvider,
  LlmRequest,
  LlmResponse,
  LlmToolCall,
  LlmUsage,
} from '../domain/LlmProvider';
import { ToolExecutionPort } from '../domain/ToolExecution';
import type { ToolExecutionPort as IToolExecutionPort } from '../domain/ToolExecution';
import { readEnvInt } from '../../shared/env.util';
import { fallbackReply } from './fallback-reply';
import { linkOnlyReply, mergeLinks, removeBookingUrls } from './reply-links';
import { guardOutput } from './output-guard';
import type { OutputGuardAction } from './output-guard';
import type { ChatLink } from '../domain/ChatLink';
import type { ChatLocale } from './fallback-reply';

export const DEFAULT_MAX_TOOL_ITERATIONS = 4;
/** Tool calls que se ejecutan por iteración; el resto recibe un error sin ejecutarse. */
export const MAX_TOOL_CALLS_PER_ITERATION = 3;

export type AgentErrorCode =
  | 'llm_unavailable'
  | 'llm_rate_limited'
  | 'llm_invalid_response'
  | 'empty_response'
  | 'internal_error';

export interface AgentRunInput {
  actor: ChatActor;
  system: string;
  /** Historial reciente user/assistant, terminando en el mensaje actual del usuario. */
  history: LlmMessage[];
  locale?: ChatLocale;
}

export interface AgentRunResult {
  reply: string;
  /** Links que produjeron las tools (ej. el de reserva); los agrega el backend, no el modelo. */
  links: ChatLink[];
  /** Tools pedidas por el modelo y enviadas a ejecutar, en orden (métricas). */
  toolNames: string[];
  usage: LlmUsage;
  llmLatencyMs: number;
  /** Iteraciones del loop que terminaron en tool calls. */
  iterations: number;
  errorCode: AgentErrorCode | null;
  /** Qué hizo el OutputGuard con la respuesta (auditoría, CLI-98). */
  guardAction: OutputGuardAction;
}

interface RunState {
  toolNames: string[];
  links: ChatLink[];
  usage: LlmUsage;
  llmLatencyMs: number;
  iterations: number;
}

function errorCodeFor(error: unknown): AgentErrorCode {
  if (error instanceof LlmUnavailableError) return 'llm_unavailable';
  if (error instanceof LlmRateLimitedError) return 'llm_rate_limited';
  if (error instanceof LlmInvalidResponseError) return 'llm_invalid_response';
  return 'internal_error';
}

/**
 * Loop de tool calling (CLI-85): LLM → tool_calls → resultados → LLM, hasta
 * que el modelo responda con texto o se alcance CHAT_MAX_TOOL_ITERATIONS
 * (default 4). Al llegar al límite se hace una última llamada sin tools para
 * forzar la respuesta. El límite protege el costo y corta loops inducidos
 * por prompt injection.
 *
 * Cualquier falla del LLM termina en una respuesta de fallback fija, sin
 * detalle técnico para el usuario (el código queda en `errorCode`).
 */
@Injectable()
export class AgentRunner {
  private readonly logger = new Logger(AgentRunner.name);

  constructor(
    @Inject(LlmProvider) private readonly llm: ILlmProvider,
    @Inject(ToolExecutionPort) private readonly tools: IToolExecutionPort,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const maxIterations = readEnvInt(
      'CHAT_MAX_TOOL_ITERATIONS',
      DEFAULT_MAX_TOOL_ITERATIONS,
    );
    const toolDefinitions = this.tools.definitionsFor(input.actor);
    const messages: LlmMessage[] = [...input.history];
    const state: RunState = {
      toolNames: [],
      links: [],
      usage: { promptTokens: 0, completionTokens: 0 },
      llmLatencyMs: 0,
      iterations: 0,
    };

    try {
      while (state.iterations < maxIterations) {
        const response = await this.callLlm(state, {
          system: input.system,
          messages,
          tools: toolDefinitions,
        });
        if (response.toolCalls.length === 0) {
          return this.finish(response.content, state, input.locale);
        }
        state.iterations++;
        messages.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        });
        for (const [index, call] of response.toolCalls.entries()) {
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: await this.runTool(input.actor, call, index, state),
          });
        }
      }

      const final = await this.callLlm(state, {
        system: input.system,
        messages,
        tools: [],
      });
      return this.finish(final.content, state, input.locale);
    } catch (error) {
      const errorCode = errorCodeFor(error);
      if (errorCode === 'internal_error') {
        this.logger.error('Error inesperado en el agente', error);
      }
      return this.result(fallbackReply(input.locale), state, errorCode);
    }
  }

  private async callLlm(
    state: RunState,
    request: LlmRequest,
  ): Promise<LlmResponse> {
    const started = Date.now();
    try {
      const response = await this.llm.chat(request);
      if (response.usage) {
        state.usage.promptTokens += response.usage.promptTokens;
        state.usage.completionTokens += response.usage.completionTokens;
      }
      return response;
    } finally {
      state.llmLatencyMs += Date.now() - started;
    }
  }

  private async runTool(
    actor: ChatActor,
    call: LlmToolCall,
    index: number,
    state: RunState,
  ): Promise<string> {
    // Cada tool_call id necesita su mensaje `tool`, aunque no se ejecute.
    if (index >= MAX_TOOL_CALLS_PER_ITERATION) {
      return JSON.stringify({ error: 'too_many_tool_calls' });
    }
    state.toolNames.push(call.name);
    const result = await this.tools.execute(actor, call);
    mergeLinks(state.links, result.links);
    return result.content;
  }

  private finish(
    content: string | null,
    state: RunState,
    locale: ChatLocale | undefined,
  ): AgentRunResult {
    const reply = content ? removeBookingUrls(content) : '';
    if (!reply && state.links.length > 0) {
      return this.result(linkOnlyReply(locale), state, null);
    }
    if (!reply) {
      return this.result(fallbackReply(locale), state, 'empty_response');
    }
    const guarded = guardOutput(reply, locale);
    if (guarded.action === 'blocked') {
      // Una respuesta bloqueada no lleva links: no se sabe qué prometía.
      state.links = [];
    }
    return this.result(guarded.reply, state, null, guarded.action);
  }

  private result(
    reply: string,
    state: RunState,
    errorCode: AgentErrorCode | null,
    guardAction: OutputGuardAction = 'none',
  ): AgentRunResult {
    return {
      reply,
      // Con fallback no se muestran links: la respuesta no los menciona.
      links: errorCode ? [] : state.links,
      toolNames: state.toolNames,
      usage: state.usage,
      llmLatencyMs: state.llmLatencyMs,
      iterations: state.iterations,
      errorCode,
      guardAction,
    };
  }
}
