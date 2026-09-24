const BATCH_SIZE = 1024;
const batch = new Uint32Array(BATCH_SIZE);
let nextIndex = BATCH_SIZE;

/**
 * Número uniforme en [0, 1) con el generador del navegador
 * (`crypto.getRandomValues`), pedido en lotes para no llamar a la API una vez
 * por partícula. Pensado para efectos visuales; está disponible también fuera
 * de contextos seguros, a diferencia de `crypto.randomUUID()`.
 */
export function randomUnit(): number {
  if (nextIndex >= BATCH_SIZE) {
    crypto.getRandomValues(batch);
    nextIndex = 0;
  }
  const value = batch[nextIndex];
  nextIndex += 1;
  return value / 2 ** 32;
}
