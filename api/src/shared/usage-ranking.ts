/** Un uso de un ítem del catálogo (tratamiento o diagnóstico) por un doctor. */
export interface UsageEntry {
  /** Qué se usó (id de tratamiento, código de diagnóstico). */
  readonly key: string;
  /**
   * Qué cuenta como un uso distinto: el mismo `occurrence` repetido suma una
   * sola vez (ej. las filas de un tratamiento aplicado a varias piezas, o un
   * mismo diagnóstico repetido en cada versión del examen del paciente).
   */
  readonly occurrence: string;
  readonly at: Date;
}

/**
 * "Frecuentes" del doctor (CLI-118): los `limit` ítems con más usos
 * distintos; a igual cantidad, el usado más recientemente primero.
 */
export function rankByUsage(
  entries: readonly UsageEntry[],
  limit: number,
): string[] {
  const stats = new Map<string, { occurrences: Set<string>; last: number }>();
  for (const e of entries) {
    const stat = stats.get(e.key) ?? {
      occurrences: new Set<string>(),
      last: 0,
    };
    stat.occurrences.add(e.occurrence);
    stat.last = Math.max(stat.last, e.at.getTime());
    stats.set(e.key, stat);
  }
  return [...stats.entries()]
    .sort(
      ([, a], [, b]) =>
        b.occurrences.size - a.occurrences.size || b.last - a.last,
    )
    .slice(0, limit)
    .map(([key]) => key);
}

/** Ventana de "frecuentes": los últimos 12 meses. */
export function frequentSince(now: Date = new Date()): Date {
  const since = new Date(now);
  since.setFullYear(since.getFullYear() - 1);
  return since;
}
