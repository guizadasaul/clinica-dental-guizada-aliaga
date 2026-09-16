/** Fila plana de doctor_schedule_blocks — mismo shape que DoctorScheduleBlock de `doctors/`, duplicado a propósito: este módulo no depende de `doctors/domain` (son contratos de lectura pública vs. escritura administrativa, ver admin.module.ts). */
export interface DoctorScheduleBlock {
  /** 0 = domingo, ..., 6 = sábado, mismo criterio que ClinicSchedule.ts. */
  weekday: number;
  /** "HH:MM". */
  start: string;
  end: string;
}

/** Fila resumida para el listado (`GET /admin/doctors`) — sin scheduleBlocks. */
export interface AdminDoctorSummary {
  /** users.id */
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  photoUrl: string | null;
  displayOrder: number;
  isBookable: boolean;
  isActive: boolean;
}

/** Detalle completo (`GET /admin/doctors/:id`, y la respuesta de create/update/deactivate) — incluye scheduleBlocks. */
export interface AdminDoctorDetail extends AdminDoctorSummary {
  bio: string | null;
  scheduleBlocks: DoctorScheduleBlock[];
}

export interface CreateAdminDoctorData {
  displayName: string;
  email: string;
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
  email?: string;
  phone?: string | null;
  specialty?: string | null;
  bio?: string | null;
  photoUrl?: string | null;
  displayOrder?: number;
  isBookable?: boolean;
  /** Si viene, reemplaza el conjunto completo de bloques (deleteMany + createMany). */
  scheduleBlocks?: DoctorScheduleBlock[];
}
