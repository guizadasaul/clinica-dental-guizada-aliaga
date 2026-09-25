import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { actorRole } from '../domain/ChatActor';
import type { ChatActor } from '../domain/ChatActor';
import type { LlmToolCall, LlmToolDefinition } from '../domain/LlmProvider';
import { ToolOutputWithLinks } from '../domain/ChatLink';
import { ToolArgsValidator } from '../domain/ToolArgsValidator';
import type { ToolArgsValidator as IToolArgsValidator } from '../domain/ToolArgsValidator';
import type {
  ToolExecutionPort,
  ToolExecutionResult,
  ToolExecutionStatus,
} from '../domain/ToolExecution';
import { isToolAllowed } from '../domain/toolPermissions';
import { readEnvInt } from '../../shared/env.util';
import { ToolRegistry } from './tool-registry';

export const DEFAULT_TOOL_TIMEOUT_MS = 5_000;
export const DEFAULT_TOOL_RESULT_MAX_CHARS = 4_000;

/** Campos de identidad que ninguna tool acepta: si el modelo los manda, es un intento de escalar. */
const IDENTITY_FIELDS: ReadonlySet<string> = new Set([
  'userId',
  'patientId',
  'doctorId',
  'role',
]);

export type ToolErrorCode =
  | 'unknown_tool'
  | 'not_allowed'
  | 'invalid_arguments'
  | 'not_found'
  | 'invalid_request'
  | 'timeout'
  | 'internal_error';

class ToolTimeoutError extends Error {}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Se interpone entre el LLM y los services (CLI-87). Por cada tool call:
 * vuelve a autorizar contra la matriz (el LLM puede pedir una tool que no se
 * le ofreció), valida los argumentos con el DTO de la tool sin aceptar
 * campos extra, ejecuta con timeout y devuelve un resultado acotado. Nunca
 * lanza: los errores vuelven al modelo como códigos genéricos, sin mensaje
 * de excepción, stack ni valores de entrada.
 */
@Injectable()
export class ToolExecutor implements ToolExecutionPort {
  private readonly logger = new Logger(ToolExecutor.name);

  constructor(
    private readonly registry: ToolRegistry,
    @Inject(ToolArgsValidator) private readonly validator: IToolArgsValidator,
  ) {}

  definitionsFor(actor: ChatActor): LlmToolDefinition[] {
    return this.registry.forActor(actor).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  async execute(
    actor: ChatActor,
    call: LlmToolCall,
  ): Promise<ToolExecutionResult> {
    const tool = this.registry.find(call.name);
    if (!tool) {
      return this.error(call.name, 'error', 'unknown_tool');
    }
    if (!isToolAllowed(actor, tool.name)) {
      this.securityEvent(actor, tool.name, 'not_allowed');
      return this.error(tool.name, 'denied', 'not_allowed');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(call.argumentsJson || '{}');
    } catch {
      return this.error(tool.name, 'error', 'invalid_arguments');
    }
    if (!isPlainObject(parsed)) {
      return this.error(tool.name, 'error', 'invalid_arguments');
    }

    const validation = await this.validator.validate(tool.argsDto, parsed);
    if (!validation.ok) {
      if (validation.fields.some((field) => IDENTITY_FIELDS.has(field))) {
        this.securityEvent(actor, tool.name, 'identity_field_in_arguments');
      }
      return this.error(tool.name, 'error', 'invalid_arguments', {
        fields: validation.fields,
      });
    }

    try {
      const result = await this.withTimeout(
        tool.execute(actor, validation.value),
      );
      if (result instanceof ToolOutputWithLinks) {
        return {
          toolName: tool.name,
          status: 'ok',
          content: this.serialize(result.data),
          links: result.links,
        };
      }
      return {
        toolName: tool.name,
        status: 'ok',
        content: this.serialize(result),
        links: [],
      };
    } catch (error) {
      return this.error(
        tool.name,
        'error',
        this.errorCodeFor(tool.name, error),
      );
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutMs = readEnvInt(
      'CHAT_TOOL_TIMEOUT_MS',
      DEFAULT_TOOL_TIMEOUT_MS,
    );
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ToolTimeoutError()), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private errorCodeFor(toolName: string, error: unknown): ToolErrorCode {
    if (error instanceof ToolTimeoutError) return 'timeout';
    if (error instanceof NotFoundException) return 'not_found';
    if (error instanceof BadRequestException) return 'invalid_request';
    // El detalle queda solo en el log del servidor, nunca vuelve al modelo.
    this.logger.error(`La tool ${toolName} falló`, error);
    return 'internal_error';
  }

  private serialize(result: unknown): string {
    const maxChars = readEnvInt(
      'CHAT_TOOL_RESULT_MAX_CHARS',
      DEFAULT_TOOL_RESULT_MAX_CHARS,
    );
    const json = JSON.stringify(result ?? null);
    if (json.length <= maxChars) {
      return json;
    }
    // Las tools deberían resumir o paginar; esto es solo la red de seguridad.
    return JSON.stringify({
      truncated: true,
      partial: json.slice(0, maxChars),
    });
  }

  private error(
    toolName: string,
    status: ToolExecutionStatus,
    code: ToolErrorCode,
    extra: Record<string, unknown> = {},
  ): ToolExecutionResult {
    return {
      toolName,
      status,
      content: JSON.stringify({ error: code, ...extra }),
      links: [],
    };
  }

  /** Sin argumentos ni resultados: solo quién, con qué rol, qué tool y por qué. */
  private securityEvent(actor: ChatActor, toolName: string, reason: string) {
    const who = actor.kind === 'user' ? `user:${actor.userId}` : 'anon';
    this.logger.warn(
      `chat.security ${reason} tool=${toolName} actor=${who} role=${actorRole(actor)}`,
    );
  }
}
