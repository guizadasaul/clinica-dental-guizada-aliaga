import type { AdminDoctorScheduleBlock } from './admin-doctor.model';

export interface CreateDoctorRequest {
  displayName: string;
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal?: string;
  /** Alcanza con un contacto: email o teléfono (CLI-77). */
  email?: string;
  phone?: string;
  specialty?: string;
  bio?: string;
  photoUrl?: string;
  displayOrder?: number;
  scheduleBlocks: AdminDoctorScheduleBlock[];
}

/** Todos los campos son opcionales — solo los presentes se actualizan (mismo criterio que el backend). */
export interface UpdateDoctorRequest {
  displayName?: string;
  firstName?: string;
  lastNamePaternal?: string;
  lastNameMaternal?: string;
  email?: string;
  phone?: string;
  specialty?: string;
  bio?: string;
  photoUrl?: string;
  displayOrder?: number;
  isBookable?: boolean;
  /** "#rrggbb" — color en la agenda común (CLI-110). */
  color?: string;
  scheduleBlocks?: AdminDoctorScheduleBlock[];
}
