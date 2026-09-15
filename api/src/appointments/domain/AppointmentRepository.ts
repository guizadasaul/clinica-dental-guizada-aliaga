import type { Appointment } from './Appointment';
import type { AppointmentWithPatient } from './AppointmentWithPatient';

export class SlotUnavailableError extends Error {
  constructor(message = 'El horario ya no está disponible') {
    super(message);
    this.name = 'SlotUnavailableError';
  }
}

export class GuestPhoneConflictError extends Error {
  constructor(message = 'Ya existe una cita activa con este número de teléfono') {
    super(message);
    this.name = 'GuestPhoneConflictError';
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
  email: string | null;
}

export interface AttachQrData {
  qrId: string;
  qrImage: string;
  amount: number;
}

export interface AgendaFilters {
  status?: string;
  from?: Date;
  to?: Date;
}

export interface IAppointmentRepository {
  /** Agenda del doctor — citas con datos básicos del paciente embebidos. */
  findForAgenda(filters: AgendaFilters): Promise<AppointmentWithPatient[]>;
  /** Citas activas (confirmed, o held vigente) que se solapan con el rango dado. */
  findActiveBetween(from: Date, to: Date, now: Date): Promise<Appointment[]>;
  findById(id: string): Promise<Appointment | null>;
  findByQrId(qrId: string): Promise<Appointment | null>;
  /** Atómico: libera holds vencidos de ese slot e intenta tomar el hold. Lanza SlotUnavailableError ante colisión. */
  createHold(data: CreateHoldData): Promise<Appointment>;
  /** UPDATE condicional (WHERE id AND status='held' AND hold_expires_at > now). null si el hold ya no está vigente. Lanza GuestPhoneConflictError si el teléfono ya tiene otra cita held/confirmed. */
  updateGuestContact(
    id: string,
    data: GuestContactData,
    now: Date,
  ): Promise<Appointment | null>;
  /** UPDATE condicional (WHERE id AND status='held'). Guarda la referencia de BANECO sobre el hold. null si ya no está held. */
  attachQr(id: string, data: AttachQrData): Promise<Appointment | null>;
  /** Best-effort, sin guard atómico — solo deja rastro para revisión manual (ej. pago llegado tras vencer el hold). */
  appendNote(id: string, note: string): Promise<void>;
  /** Holds con un QR de BANECO generado, vencidos o no — usado por HoldExpiryScheduler para reconciliar timers al arrancar (CLI-24). */
  findHeldWithQr(): Promise<Appointment[]>;
  /** UPDATE condicional (WHERE id AND status='held') → 'expired'. Usado tras anular el QR en BANECO al vencer el hold. */
  markExpired(id: string): Promise<void>;
}

export const AppointmentRepository = Symbol('IAppointmentRepository');
