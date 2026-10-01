/**
 * Puerto para saber si la base de datos responde. Lo usa el readiness check
 * (`GET /health/ready`): el reverse proxy y el pipeline de deploy esperan a
 * que devuelva 200 antes de dar por buena una versión nueva.
 */
export interface DatabaseHealth {
  /** Resuelve si la base responde; rechaza si no. */
  ping(): Promise<void>;
}

export const DatabaseHealth = Symbol('DatabaseHealth');
