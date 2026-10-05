import type { AppointmentStatusCounts } from './OperationalReport';

/**
 * Un día del rango, en el huso horario de la clínica (CLI-199). Alimenta los
 * gráficos de evolución de la pantalla de Reportes.
 */
export interface TrendDay {
  /** YYYY-MM-DD. */
  date: string;
  /** Citas de ese día por estado (canceladas incluidas, cada una en su estado). */
  appointmentsByStatus: AppointmentStatusCounts;
  /** Suma de pagos registrados ese día. */
  collected: number;
}

export interface TrendsReport {
  /** YYYY-MM-DD, tal como vino en el query. */
  from: string;
  to: string;
  /** Un elemento por cada día del rango, también los días sin actividad. */
  days: TrendDay[];
}
