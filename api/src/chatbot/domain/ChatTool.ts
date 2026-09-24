import type { ChatActor } from './ChatActor';
import type { ToolName } from './toolPermissions';

/** JSON Schema de los argumentos, tal como se le envía al LLM. */
export type JsonSchema = Record<string, unknown>;

/**
 * Una herramienta que el LLM puede pedir. Convenciones para toda tool:
 *
 * - Las tools "my" (get_my_*) NO declaran patientId/doctorId/userId en sus
 *   argumentos: la identidad sale siempre de `actor`, que resuelve el
 *   backend. Un campo así en los argumentos se rechaza (forbidNonWhitelisted).
 * - `argsDto` es una clase con decoradores de class-validator; ToolExecutor
 *   valida los argumentos con ella antes de llamar a `execute`.
 * - `execute` devuelve un objeto plano y mínimo (nunca una entidad de dominio
 *   completa, ni notas libres, ni ids internos que el LLM no necesite).
 */
export interface ChatTool<TArgs extends object = object> {
  readonly name: ToolName;
  readonly description: string;
  readonly parameters: JsonSchema;
  readonly argsDto: new () => TArgs;
  execute(actor: ChatActor, args: TArgs): Promise<unknown>;
}
