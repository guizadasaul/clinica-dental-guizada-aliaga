import type { Appointment } from './Appointment';
import type { AppointmentWithPatient } from './AppointmentWithPatient';
import type { PatientAppointment } from './PatientAppointment';

export class SlotUnavailableError extends Error {
  constructor(message = 'El horario ya no está disponible') {
    super(message);
    this.name = 'SlotUnavailableError';
  }
}

export class PatientNotFoundError extends Error {
  constructor(message = 'Paciente no encontrado') {
    super(message);
    this.name = 'PatientNotFoundError';
  }
}

export class GuestPhoneConflictError extends Error {
  constructor(
    message = 'Ya existe una cita activa con este número de teléfono',
  ) {
    super(message);
    this.name = 'GuestPhoneConflictError';
  }
}

// Guest intentando reservar con el email/teléfono de una cuenta que ya
// existe (users.email es UNIQUE — CLI-9 exploró re-vincular en confirmación,
// pero eso deja que un desconocido pague y quede atado a la cuenta de otra
// persona; mejor cortar acá, antes de que llegue a pagar, y pedirle que
// inicie sesión).
export class GuestEmailBelongsToAccountError extends Error {
  constructor(message = 'Ese email ya pertenece a una cuenta existente') {
    super(message);
    this.name = 'GuestEmailBelongsToAccountError';
  }
}

export class GuestPhoneBelongsToAccountError extends Error {
  constructor(
    message = 'Ese número de teléfono ya pertenece a una cuenta existente',
  ) {
    super(message);
    this.name = 'GuestPhoneBelongsToAccountError';
  }
}

export interface CreateHoldData {
  /** CLI-56: el doctor con el que se reserva — cada uno tiene su propia agenda. */
  doctorId: string;
  slot: Date;
  holdExpiresAt: Date;
  treatmentId: string | null;
  /** Congelada al crear el hold (CLI-47) — snapshot de treatments.estimatedMinutes, o SLOT_MINUTES si no se especificó tratamiento. */
  durationMinutes: number;
  source: string;
}

/** CLI-148: cita que agenda el doctor para un paciente con ficha. */
export interface CreateByDoctorData {
  /** Siempre el doctor autenticado — nunca un dato del body. */
  doctorId: string;
  patientId: string;
  treatmentId: string | null;
  appointmentDatetime: Date;
  durationMinutes: number;
  notes: string | null;
}

/** CLI-149: nuevo horario de una cita confirmada. */
export interface RescheduleData {
  appointmentDatetime: Date;
  durationMinutes: number;
  /** undefined = no tocar las notas. */
  notes?: string | null;
}

export interface GuestContactData {
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal: string | null;
  phone: string;
  email: string | null;
}

export interface AttachQrData {
  qrId: string;
  qrImage: string;
  amount: number;
}

export interface AgendaFilters {
  /** Sin valor = agenda común, todos los doctores (CLI-110). CLI-57: siempre el doctor autenticado (request.appUser.id) — un doctor no debe poder pedir la agenda de otro. CLI-64: excepción, un ADMIN puede pasar el doctorId de cualquier doctor vía query param; esa resolución vive en DoctorAppointmentsController, no acá. */
  doctorId?: string;
  status?: string;
  from?: Date;
  to?: Date;
}

/** Filtros de las citas de un paciente (CLI-91). `to` es exclusivo. */
export interface PatientAppointmentFilters {
  from?: Date;
  to?: Date;
  order: 'asc' | 'desc';
  limit: number;
}

export interface IAppointmentRepository {
  /** Agenda del doctor — citas con datos básicos del paciente embebidos. */
  findForAgenda(filters: AgendaFilters): Promise<AppointmentWithPatient[]>;
  /** Citas CONFIRMADAS de un paciente (CLI-91): el patientId sale siempre de la identidad autenticada, nunca de un parámetro del usuario. */
  findForPatient(
    patientId: string,
    filters: PatientAppointmentFilters,
  ): Promise<PatientAppointment[]>;
  /** Citas activas (confirmed, o held vigente) de ESE doctor que empiezan dentro del rango dado — CLI-56: cada doctor tiene su propia agenda. */
  findActiveBetween(
    from: Date,
    to: Date,
    now: Date,
    doctorId: string,
  ): Promise<Appointment[]>;
  findById(id: string): Promise<Appointment | null>;
  findByQrId(qrId: string): Promise<Appointment | null>;
  /** Atómico: libera holds vencidos de ese slot e intenta tomar el hold. Lanza SlotUnavailableError ante colisión. */
  createHold(data: CreateHoldData): Promise<Appointment>;
  /** CLI-148: crea una cita ya confirmada (source `doctor`, sin pago). Lanza PatientNotFoundError si el paciente no existe y SlotUnavailableError si otra cita activa del doctor ya empieza a esa hora (índice único). El solapamiento por duración lo valida quien llama. */
  createByDoctor(data: CreateByDoctorData): Promise<AppointmentWithPatient>;
  /** CLI-149: una cita de ESE doctor, con el shape de la agenda. null si no existe o es de otro doctor (no se distingue, para no filtrar existencia). */
  findForDoctor(
    id: string,
    doctorId: string,
  ): Promise<AppointmentWithPatient | null>;
  /** CLI-149: UPDATE condicional (WHERE id AND doctor_id AND status='confirmed'). null si ya no está confirmada. Lanza SlotUnavailableError ante choque en el índice único. */
  reschedule(
    id: string,
    doctorId: string,
    data: RescheduleData,
  ): Promise<AppointmentWithPatient | null>;
  /** CLI-149: UPDATE condicional (WHERE id AND doctor_id AND status='confirmed') → 'cancelled', con quién/cuándo y el motivo agregado a las notas. null si ya no estaba confirmada. */
  cancel(
    id: string,
    doctorId: string,
    cancelledBy: string,
    reason: string | null,
  ): Promise<AppointmentWithPatient | null>;
  /** UPDATE condicional (WHERE id AND status='held' AND hold_expires_at > now). null si el hold ya no está vigente. Lanza GuestPhoneConflictError si el teléfono ya tiene otra cita held/confirmed, o GuestEmailBelongsToAccountError/GuestPhoneBelongsToAccountError si el email/teléfono ya pertenece a una cuenta (users) existente. */
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
