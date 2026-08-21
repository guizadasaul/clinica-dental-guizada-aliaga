/**
 * Payloads de inyección SQL clásicos, reusados por los specs de DTO
 * (`*.dto.spec.ts`, sin DB) y por el e2e (`test/public-forms-security.e2e-spec.ts`,
 * con DB) — ver Fase 1.5 del plan de CLI-36. No demuestran una vulnerabilidad
 * real (Prisma parametriza todo el acceso a datos, ver Context del plan);
 * sirven para demostrar y blindar contra regresión que los DTOs públicos
 * rechazan este tipo de texto como dato de entrada.
 */
export const INJECTION_PAYLOADS = [
  `' OR '1'='1`,
  `admin'--`,
  `Robert'); DROP TABLE testimonials;--`,
  `1; DELETE FROM appointments WHERE 1=1`,
  `" UNION SELECT * FROM users --`,
] as const;
