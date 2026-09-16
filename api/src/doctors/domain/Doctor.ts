export interface Doctor {
  /** users.id — el mismo id que appointments.doctor_id/patients.assigned_doctor_id. */
  id: string;
  displayName: string | null;
  specialty: string | null;
  bio: string | null;
  /** Foto profesional pública (doctor_profiles.photo_url) — distinta del avatar de Google en users.photo_url. */
  photoUrl: string | null;
  displayOrder: number;
  isBookable: boolean;
}
