/** Resultado de un barrido de consultas web (CLI-257). */
export interface WebConsultationSync {
  /** Consultas que pasaron a realizadas (la cita ya pasó). */
  performed: number;
  /** Consultas que dejaron de contar como realizadas ("No asistió"). */
  undone: number;
}

export interface IWebConsultationRepository {
  /** Deja al día cuáles consultas web pagadas cuentan como realizadas a `now`. */
  sync(now: Date): Promise<WebConsultationSync>;
}

export const WebConsultationRepository = Symbol('IWebConsultationRepository');
