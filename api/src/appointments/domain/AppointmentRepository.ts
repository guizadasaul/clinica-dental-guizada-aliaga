import type { Appointment } from './Appointment';

export class SlotUnavailableError extends Error {
  constructor(message = 'El horario ya no está disponible') {
    super(message);
    this.name = 'SlotUnavailableError';
  }
}

export interface CreateHoldData {
  slot: Date;
  holdExpiresAt: Date;
  treatmentId: string | null;
  source: string;
}

export interface GuestContactData {
  fullName: string;
  phone: string;
}

export interface IAppointmentRepository {
  /** Citas activas (confirmed, o held vigente) que se solapan con el rango dado. */
  findActiveBetween(from: Date, to: Date, now: Date): Promise<Appointment[]>;
  findById(id: string): Promise<Appointment | null>;
  /** Atómico: libera holds vencidos de ese slot e intenta tomar el hold. Lanza SlotUnavailableError ante colisión. */
  createHold(data: CreateHoldData): Promise<Appointment>;
  /** UPDATE condicional (WHERE id AND status='held' AND hold_expires_at > now). null si el hold ya no está vigente. */
  updateGuestContact(
    id: string,
    data: GuestContactData,
    now: Date,
  ): Promise<Appointment | null>;
}

export const AppointmentRepository = Symbol('IAppointmentRepository');
