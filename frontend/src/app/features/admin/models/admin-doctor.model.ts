export interface AdminDoctorScheduleBlock {
  /** 0 = domingo, ..., 6 = sábado. */
  weekday: number;
  /** "HH:MM". */
  start: string;
  end: string;
}

/** 'pending' = todavía no canjeó su invitación; 'active' = ya tiene acceso (CLI-76). */
export type DoctorRegistrationStatus = 'pending' | 'active';

/** GET /admin/doctors — fila resumida, sin scheduleBlocks. */
export interface AdminDoctorSummary {
  id: string;
  /** Nombre público (con "Dr./Dra."), el que ve el paciente al reservar. */
  displayName: string | null;
  /** Nombre y apellidos reales. null en doctores cargados antes de CLI-76. */
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
}

/** GET /admin/doctors/:id y la respuesta de create/update/deactivate. */
export interface AdminDoctorDetail extends AdminDoctorSummary {
  bio: string | null;
  scheduleBlocks: AdminDoctorScheduleBlock[];
}

/** Respuesta de POST /admin/doctors. Crear no manda ninguna invitación: se envía aparte (CLI-77). */
export interface CreateDoctorResult {
  doctor: AdminDoctorDetail;
}
