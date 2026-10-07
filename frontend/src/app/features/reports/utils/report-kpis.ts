import type { FinancialReport, OperationalReport } from '../models/report.model';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Totales de la clínica (todas las filas por doctor sumadas) para un rango. */
export interface ReportKpis {
  /** Citas del rango sin las canceladas (mismo criterio que totalAppointments). */
  appointments: number;
  cancelled: number;
  newPatients: number;
  /** Fracción 0..1 — Σ horarios tomados (confirmadas + atendidas) / Σ capacidad teórica; null si no hay capacidad. */
  occupancyRate: number | null;
  collected: number;
  /** Saldo actual de presupuestos no pagados: no depende del rango. */
  pending: number;
}

export interface DateRange {
  /** YYYY-MM-DD, inclusive. */
  from: string;
  /** YYYY-MM-DD, inclusive. */
  to: string;
}

function sum<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((acc, row) => acc + pick(row), 0);
}

export function buildKpis(operational: OperationalReport, financial: FinancialReport): ReportKpis {
  const slots = sum(operational.doctors, (r) => r.theoreticalSlots);
  const confirmed = sum(operational.doctors, (r) => r.confirmedAppointments);
  return {
    appointments: sum(operational.doctors, (r) => r.totalAppointments),
    cancelled: sum(operational.doctors, (r) => r.appointmentsByStatus['cancelled'] ?? 0),
    newPatients: sum(operational.doctors, (r) => r.newPatients),
    occupancyRate: slots > 0 ? confirmed / slots : null,
    collected: sum(financial.doctors, (r) => r.collected),
    pending: sum(financial.doctors, (r) => r.pending),
  };
}

/**
 * Variación porcentual de `current` contra `previous`, redondeada a entero.
 * null cuando no hay base para comparar (período anterior en cero).
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function parseDate(value: string): number {
  return Date.parse(`${value}T00:00:00Z`);
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Cantidad de días del rango, contando ambos extremos. */
export function rangeLengthInDays(range: DateRange): number {
  return Math.round((parseDate(range.to) - parseDate(range.from)) / DAY_MS) + 1;
}

/** El período del mismo largo que termina el día anterior a `range.from`. */
export function previousRange(range: DateRange): DateRange {
  const days = rangeLengthInDays(range);
  const to = parseDate(range.from) - DAY_MS;
  return { from: formatDate(to - (days - 1) * DAY_MS), to: formatDate(to) };
}

/** YYYY-MM-DD de la fecha local (no UTC: a las 21:00 en La Paz ya sería "mañana" en UTC). */
export function localDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Los últimos `days` días terminando hoy (hoy incluido). */
export function lastDaysRange(days: number, today: Date = new Date()): DateRange {
  const to = localDateString(today);
  return { from: formatDate(parseDate(to) - (days - 1) * DAY_MS), to };
}
