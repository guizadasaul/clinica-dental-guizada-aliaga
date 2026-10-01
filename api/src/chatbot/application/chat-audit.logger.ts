import { Injectable, Logger } from '@nestjs/common';
import type { ChatAuditContext, ChatSecurityReason } from '../domain/ChatAudit';
import type { ChatChannel } from '../domain/ChatChannel';
import type { ToolExecutionStatus } from '../domain/ToolExecution';

export interface ToolCallAudit {
  name: string;
  status: ToolExecutionStatus;
  ms: number;
}

export interface ChatTurnAudit {
  channel: ChatChannel;
  tools: ToolCallAudit[];
  llmMs: number;
  totalMs: number;
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
  iterations: number;
  errorCode: string | null;
}

/**
 * Eventos estructurados del chatbot (CLI-98), una línea JSON cada uno. Cada
 * campo se copia a mano a propósito (nunca un spread del input): así no hay
 * forma de que se cuele el texto del usuario, la respuesta, los argumentos o
 * resultados de una tool, el system prompt ni un token.
 */
@Injectable()
export class ChatAuditLogger {
  private readonly logger = new Logger('ChatAudit');

  turn(context: ChatAuditContext, turn: ChatTurnAudit): void {
    this.logger.log(
      JSON.stringify({
        event: 'chat.turn',
        requestId: context.requestId,
        ts: new Date().toISOString(),
        channel: turn.channel,
        actor: context.actor,
        role: context.role,
        // La intención observable es qué tools eligió el modelo.
        intent: turn.tools.length > 0 ? 'tool' : 'no_tool',
        tools: turn.tools.map((tool) => ({
          name: tool.name,
          status: tool.status,
          ms: tool.ms,
        })),
        llmMs: turn.llmMs,
        totalMs: turn.totalMs,
        promptTokens: turn.promptTokens,
        cachedPromptTokens: turn.cachedPromptTokens,
        completionTokens: turn.completionTokens,
        iterations: turn.iterations,
        errorCode: turn.errorCode,
      }),
    );
  }

  security(
    context: ChatAuditContext,
    reason: ChatSecurityReason,
    tool: string | null = null,
  ): void {
    this.logger.warn(
      JSON.stringify({
        event: 'chat.security',
        requestId: context.requestId,
        ts: new Date().toISOString(),
        actor: context.actor,
        role: context.role,
        reason,
        tool,
      }),
    );
  }
}
