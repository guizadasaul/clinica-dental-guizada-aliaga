import type { AdminDoctorScheduleBlock } from './admin-doctor.model';

export interface CreateDoctorRequest {
  displayName: string;
  email: string;
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
  email?: string;
  phone?: string;
  specialty?: string;
  bio?: string;
  photoUrl?: string;
  displayOrder?: number;
  isBookable?: boolean;
  scheduleBlocks?: AdminDoctorScheduleBlock[];
}
