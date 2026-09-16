export interface AdminDoctorScheduleBlock {
  /** 0 = domingo, ..., 6 = sábado. */
  weekday: number;
  /** "HH:MM". */
  start: string;
  end: string;
}

/** GET /admin/doctors — fila resumida, sin scheduleBlocks. */
export interface AdminDoctorSummary {
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

/** GET /admin/doctors/:id y la respuesta de create/update/deactivate. */
export interface AdminDoctorDetail extends AdminDoctorSummary {
  bio: string | null;
  scheduleBlocks: AdminDoctorScheduleBlock[];
}

/** Respuesta de POST /admin/doctors. */
export interface CreateDoctorResult {
  doctor: AdminDoctorDetail;
  /** false si el doctor se creó bien pero el email de invitación falló (Resend caído, etc.) — el admin puede reintentarla desde el panel de invitaciones. */
  inviteSent: boolean;
}
