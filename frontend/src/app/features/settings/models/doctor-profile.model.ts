import type { ScheduleBlock } from '../../../shared/utils/schedule-blocks.util';

/** GET/PATCH /doctors/me — el perfil del propio doctor (CLI-191). */
export interface DoctorProfile {
  id: string;
  /** Nombre público (con "Dr./Dra."), el que ve el paciente al reservar. */
  displayName: string | null;
  firstName: string | null;
  lastNamePaternal: string | null;
  lastNameMaternal: string | null;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  bio: string | null;
  /** Color en la agenda común, "#rrggbb". */
  color: string;
  scheduleBlocks: ScheduleBlock[];
}

/** Solo lo que el doctor puede editar; los campos que no vienen no se tocan. */
export interface UpdateDoctorProfileRequest {
  displayName?: string;
  firstName?: string;
  lastNamePaternal?: string;
  lastNameMaternal?: string;
  phone?: string;
  specialty?: string;
  bio?: string;
  color?: string;
  scheduleBlocks?: ScheduleBlock[];
}
