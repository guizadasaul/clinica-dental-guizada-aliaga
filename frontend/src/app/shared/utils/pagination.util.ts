/** Cuántas páginas hacen falta para `total` elementos (mínimo 1). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** La página pedida llevada a un valor válido (1..última), por si la lista se achicó. */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, page), pageCount(total, pageSize));
}

/** Los elementos de la página (desde 1). */
export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const start = (clampPage(page, items.length, pageSize) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
