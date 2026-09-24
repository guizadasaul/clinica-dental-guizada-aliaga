import { Injectable, Logger } from '@nestjs/common';
import {
  LlmInvalidResponseError,
  LlmRateLimitedError,
  LlmUnavailableError,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from '../../domain/LlmProvider.js';
import { readEnvInt } from '../../../shared/env.util.js';
import {
  fromGroqResponseBody,
  toGroqRequestBody,
  type GroqReasoningEffort,
} from './groq.mapper.js';

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_TIMEOUT_MS = 20_000;
// gpt-oss cuenta el razonamiento dentro de max_completion_tokens: con muy
// poco margen corta la respuesta (finish_reason=length) antes del texto.
const DEFAULT_MAX_COMPLETION_TOKENS = 1024;
const RETRY_DELAY_MS = 500;
const MAX_RETRY_AFTER_MS = 3_000;
const REASONING_EFFORTS: ReadonlySet<string> = new Set<GroqReasoningEffort>([
  'low',
  'medium',
  'high',
]);

/** Quita las barras finales sin regex (evita backtracking con muchas barras). */
function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') {
    end--;
  }
  return url.slice(0, end);
}

interface GroqConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxCompletionTokens: number;
  reasoningEffort: GroqReasoningEffort;
}

/** Falla que vale la pena reintentar una vez; `error` es lo que se lanza si el reintento también falla. */
class RetryableFailure extends Error {
  constructor(
    readonly error: Error,
    readonly delayMs: number,
  ) {
    super(error.message);
    this.name = 'RetryableFailure';
  }
}

/**
 * Adaptador de Groq (GPT-OSS) para el puerto LlmProvider — el único lugar del
 * backend que conoce a Groq. API compatible con OpenAI vía `fetch` nativo,
 * sin SDK.
 *
 * La configuración se lee de forma perezosa en cada llamada, igual que
 * BanecoClient: si falta GROQ_API_KEY la app arranca igual y solo falla el
 * chat (Nest instancia los providers en el bootstrap).
 *
 * Nunca se loguea ni se propaga el cuerpo de un error de Groq (puede traer
 * fragmentos del prompt, con datos del usuario) ni la API key: solo el
 * status HTTP y el `error.code`.
 */
@Injectable()
export class GroqLlmProvider implements LlmProvider {
  private readonly logger = new Logger(GroqLlmProvider.name);

  async chat(request: LlmRequest): Promise<LlmResponse> {
    const config = this.getConfig();
    const body = JSON.stringify(
      toGroqRequestBody(request, {
        model: config.model,
        maxCompletionTokens: config.maxCompletionTokens,
        reasoningEffort: config.reasoningEffort,
      }),
    );

    // Un único reintento, solo para 429, 5xx y tool_use_failed.
    try {
      return await this.attempt(config, body);
    } catch (error) {
      if (!(error instanceof RetryableFailure)) {
        throw error;
      }
      await this.wait(error.delayMs);
    }
    try {
      return await this.attempt(config, body);
    } catch (error) {
      throw error instanceof RetryableFailure ? error.error : error;
    }
  }

  /** Aislado para poder evitar esperas reales en los tests. */
  protected wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getConfig(): GroqConfig {
    const apiKey = process.env['GROQ_API_KEY'];
    if (!apiKey) {
      this.logger.error('GROQ_API_KEY no está configurada');
      throw new LlmUnavailableError('El asistente no está configurado');
    }
    const effort = process.env['GROQ_REASONING_EFFORT'] as GroqReasoningEffort;
    return {
      apiKey,
      baseUrl: withoutTrailingSlashes(
        process.env['GROQ_BASE_URL'] || DEFAULT_BASE_URL,
      ),
      model: process.env['GROQ_MODEL'] || DEFAULT_MODEL,
      timeoutMs: readEnvInt('GROQ_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
      maxCompletionTokens: readEnvInt(
        'GROQ_MAX_COMPLETION_TOKENS',
        DEFAULT_MAX_COMPLETION_TOKENS,
      ),
      reasoningEffort: REASONING_EFFORTS.has(effort) ? effort : 'low',
    };
  }

  private async attempt(
    config: GroqConfig,
    body: string,
  ): Promise<LlmResponse> {
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch {
      // Timeout o error de red: no se reintenta, para acotar la latencia.
      this.logger.warn('No se pudo llamar a Groq (timeout o error de red)');
      throw new LlmUnavailableError();
    }

    if (response.ok) {
      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        throw new LlmInvalidResponseError(
          'Groq devolvió un cuerpo que no es JSON',
        );
      }
      return fromGroqResponseBody(parsed);
    }

    const code = await this.readErrorCode(response);
    const codeSuffix = code ? ` (${code})` : '';
    this.logger.warn(`Groq respondió HTTP ${response.status}${codeSuffix}`);

    if (response.status === 429) {
      throw new RetryableFailure(
        new LlmRateLimitedError(),
        this.retryAfterMs(response),
      );
    }
    if (response.status >= 500) {
      throw new RetryableFailure(new LlmUnavailableError(), RETRY_DELAY_MS);
    }
    if (response.status === 400 && code === 'tool_use_failed') {
      // El modelo generó un tool call malformado: reintentar suele alcanzar.
      throw new RetryableFailure(
        new LlmInvalidResponseError('tool_use_failed'),
        0,
      );
    }
    // 400/401/403/404: problema de configuración o del request, no del modelo.
    throw new LlmUnavailableError();
  }

  /** Solo `error.code` — el resto del cuerpo nunca se usa ni se loguea. */
  private async readErrorCode(response: Response): Promise<string | null> {
    try {
      const parsed = (await response.json()) as {
        error?: { code?: unknown };
      } | null;
      const code = parsed?.error?.code;
      return typeof code === 'string' ? code : null;
    } catch {
      return null;
    }
  }

  private retryAfterMs(response: Response): number {
    const seconds = Number(response.headers.get('retry-after'));
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return RETRY_DELAY_MS;
    }
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
}
