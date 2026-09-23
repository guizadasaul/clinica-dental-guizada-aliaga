/** Fila plana de doctor_schedule_blocks — mismo shape que DoctorScheduleBlock de `doctors/`, duplicado a propósito: este módulo no depende de `doctors/domain` (son contratos de lectura pública vs. escritura administrativa, ver admin.module.ts). */
export interface DoctorScheduleBlock {
  /** 0 = domingo, ..., 6 = sábado, mismo criterio que ClinicSchedule.ts. */
  weekday: number;
  /** "HH:MM". */
  start: string;
  end: string;
}

/**
 * 'pending' = el doctor todavía no canjeó su invitación (users.auth_user_id es
 * null); 'active' = ya vinculó una identidad de login. Derivado, sin columna
 * propia (CLI-76).
 */
export type DoctorRegistrationStatus = 'pending' | 'active';

/** Fila resumida para el listado (`GET /admin/doctors`) — sin scheduleBlocks. */
export interface AdminDoctorSummary {
  /** users.id */
  id: string;
  /** Nombre público (users.display_name), el que ve el paciente al reservar. */
  displayName: string | null;
  /** Nombre y apellidos reales (doctor_profiles). null en doctores cargados antes de CLI-76. */
  firstName: string | null;
  lastNamePaternal: string | null;
  lastNameMaternal: string | null;
  registrationStatus: DoctorRegistrationStatus;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  photoUrl: string | null;
  displayOrder: number;
  isBookable: boolean;
  isActive: boolean;
  /** Color del doctor en la agenda común (CLI-110). */
  color: string;
}

/** Detalle completo (`GET /admin/doctors/:id`, y la respuesta de create/update/deactivate) — incluye scheduleBlocks. */
export interface AdminDoctorDetail extends AdminDoctorSummary {
  bio: string | null;
  scheduleBlocks: DoctorScheduleBlock[];
}

export interface CreateAdminDoctorData {
  displayName: string;
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal: string | null;
  /** Al menos uno de email/phone viene cargado (lo garantiza CreateDoctorDto). */
  email: string | null;
  phone: string | null;
  specialty: string | null;
  bio: string | null;
  photoUrl: string | null;
  /** null → el repo aplica el default (0). */
  displayOrder: number | null;
  scheduleBlocks: DoctorScheduleBlock[];
}

/** Solo los campos presentes se actualizan — mismo criterio "undefined = no tocar" que UpdateContactInfoData (auth). */
export interface UpdateAdminDoctorData {
  displayName?: string;
  firstName?: string;
  lastNamePaternal?: string;
  lastNameMaternal?: string | null;
  email?: string;
  phone?: string | null;
  specialty?: string | null;
  bio?: string | null;
  photoUrl?: string | null;
  displayOrder?: number;
  isBookable?: boolean;
  color?: string;
  /** Si viene, reemplaza el conjunto completo de bloques (deleteMany + createMany). */
  scheduleBlocks?: DoctorScheduleBlock[];
}
