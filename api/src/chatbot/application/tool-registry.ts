import { Inject, Injectable } from '@nestjs/common';
import type { ChatActor } from '../domain/ChatActor';
import type { ChatTool } from '../domain/ChatTool';
import { isKnownToolName, isToolAllowed } from '../domain/toolPermissions';

/** Token multi-provider: cada archivo de tools aporta su array de ChatTool. */
export const CHAT_TOOLS = Symbol('CHAT_TOOLS');

/**
 * Catálogo de tools registradas (CLI-87). Valida al arrancar (fail fast) que
 * los nombres sean únicos y que cada tool figure en la matriz de permisos:
 * una tool sin permisos definidos sería inalcanzable, y seguramente un error.
 */
@Injectable()
export class ToolRegistry {
  private readonly byName = new Map<string, ChatTool>();

  constructor(@Inject(CHAT_TOOLS) tools: ChatTool[]) {
    for (const tool of tools) {
      const name: string = tool.name;
      if (!isKnownToolName(name)) {
        throw new Error(
          `La tool ${name} no está en la matriz de permisos (toolPermissions.ts)`,
        );
      }
      if (this.byName.has(tool.name)) {
        throw new Error(`Tool registrada dos veces: ${tool.name}`);
      }
      this.byName.set(tool.name, tool);
    }
  }

  /** Solo las tools que el actor tiene permitidas. */
  forActor(actor: ChatActor): ChatTool[] {
    return [...this.byName.values()].filter((tool) =>
      isToolAllowed(actor, tool.name),
    );
  }

  find(name: string): ChatTool | undefined {
    return this.byName.get(name);
  }
}
