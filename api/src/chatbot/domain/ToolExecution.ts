import type { ChatActor } from './ChatActor';
import type { ChatAuditContext } from './ChatAudit';
import type { ChatLink } from './ChatLink';
import type { LlmToolCall, LlmToolDefinition } from './LlmProvider';

export type ToolExecutionStatus = 'ok' | 'denied' | 'error';

export interface ToolExecutionResult {
  toolName: string;
  status: ToolExecutionStatus;
  /** Lo que vuelve al LLM como mensaje `tool` (JSON serializado). */
  content: string;
  /** Links para el usuario que produjo la tool; nunca pasan por el LLM. */
  links: ChatLink[];
}

/**
 * Puerto entre el agente y las tools. El agente nunca ejecuta una tool por
 * su cuenta: le pide a este puerto las definiciones que puede ver el actor y
 * le delega cada tool call, que la implementación vuelve a autorizar,
 * valida y ejecuta (ToolRegistry + ToolExecutor, CLI-87).
 */
export interface ToolExecutionPort {
  /** Solo las tools que el actor tiene permitidas (lo que se le ofrece al LLM). */
  definitionsFor(actor: ChatActor): LlmToolDefinition[];
  /**
   * Nunca lanza: una tool desconocida, prohibida o que falla devuelve status
   * != 'ok'. `audit` correlaciona los eventos de seguridad con el turno.
   */
  execute(
    actor: ChatActor,
    call: LlmToolCall,
    audit?: ChatAuditContext,
  ): Promise<ToolExecutionResult>;
}

export const ToolExecutionPort = Symbol('ToolExecutionPort');
