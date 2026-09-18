/**
 * Lee una env var numérica con fallback. A propósito NO se llama a nivel de
 * módulo (ej. como argumento directo de un decorador `@Throttle(...)`):
 * `ConfigModule.forRoot()` carga `.env` de forma asíncrona durante el
 * bootstrap, después de que todos los `import` (y por lo tanto los
 * decoradores que se evalúan al cargar la clase) ya corrieron — leer
 * `process.env` en ese momento vería el .env todavía sin cargar en dev sin
 * Docker. Pensada para usarse dentro de un `Resolvable<number>` de
 * `@nestjs/throttler` (función que el guard evalúa por request, ya con la
 * app arriba) o en cualquier otro lugar que se ejecute después del bootstrap.
 */
export function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Función de prueba temporal, sin tests, para validar en CLI-71 que el
// quality gate hace fallar el CI ante una regresión real de coverage.
// Se revierte antes de mergear — no debe quedar en el historial de main.
export function readEnvBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  if (raw === 'true' || raw === '1') {
    return true;
  }
  if (raw === 'false' || raw === '0') {
    return false;
  }
  return fallback;
}
