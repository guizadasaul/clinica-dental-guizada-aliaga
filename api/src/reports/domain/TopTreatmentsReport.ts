/**
 * Tratamientos más realizados en un rango (CLI-93). Cuenta filas de
 * tooth_procedures: cada pieza tratada cuenta una vez (una aplicación en tres
 * piezas suma 3), que es lo que refleja la carga de trabajo real.
 */
export interface TopTreatmentRow {
  treatmentId: string;
  name: string;
  count: number;
}

export interface TopTreatmentsReport {
  /** YYYY-MM-DD, tal como vino en el query. */
  from: string;
  to: string;
  treatments: TopTreatmentRow[];
}
