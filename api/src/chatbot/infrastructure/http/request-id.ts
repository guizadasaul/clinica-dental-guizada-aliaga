import { randomUUID } from 'node:crypto';

const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

/**
 * x-request-id del cliente si tiene forma de id (sin espacios ni nada que
 * pueda romper una línea de log); si no, uno nuevo (CLI-98).
 */
export function resolveRequestId(
  header: string | string[] | undefined,
): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value && REQUEST_ID_PATTERN.test(value) ? value : randomUUID();
}
