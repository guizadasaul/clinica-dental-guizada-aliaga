import { lastDaysRange, localDateString, type DateRange } from './report-kpis';

/** Rangos rápidos de la pantalla de Reportes (CLI-199). */
export type RangePreset = '7d' | '30d' | 'month' | 'prevMonth' | 'custom';

export const RANGE_PRESETS: readonly { key: RangePreset; label: string }[] = [
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'prevMonth', label: 'Mes pasado' },
  { key: 'custom', label: 'Personalizado' },
];

/** El rango de un preset; 'custom' no tiene rango propio (lo elige el admin). */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: Date = new Date()): DateRange {
  switch (preset) {
    case '7d':
      return lastDaysRange(7, today);
    case '30d':
      return lastDaysRange(30, today);
    case 'month':
      return {
        from: localDateString(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: localDateString(today),
      };
    case 'prevMonth':
      return {
        from: localDateString(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: localDateString(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
  }
}

const SHORT_DATE = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const SHORT_DATE_YEAR = new Intl.DateTimeFormat('es-BO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "6 sept – 5 oct 2026": las fechas YYYY-MM-DD se leen como días de calendario. */
export function formatRange(range: DateRange): string {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  return `${(sameYear ? SHORT_DATE : SHORT_DATE_YEAR).format(from)} – ${SHORT_DATE_YEAR.format(to)}`;
}
