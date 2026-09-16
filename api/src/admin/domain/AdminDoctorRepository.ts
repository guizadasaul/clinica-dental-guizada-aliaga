import type {
  AdminDoctorDetail,
  AdminDoctorSummary,
  CreateAdminDoctorData,
  UpdateAdminDoctorData,
} from './AdminDoctor';

export interface IAdminDoctorRepository {
  findAll(): Promise<AdminDoctorSummary[]>;
  /** null si no existe ningún doctor con ese id. */
  findById(id: string): Promise<AdminDoctorDetail | null>;
  /** Crea users + doctor_profiles + doctor_schedule_blocks en una transacción. Lanza ConflictException si el email ya está en uso. */
  create(data: CreateAdminDoctorData): Promise<AdminDoctorDetail>;
  /** null si no existe ningún doctor con ese id. Lanza ConflictException si el email ya está en uso por otra cuenta. */
  update(
    id: string,
    data: UpdateAdminDoctorData,
  ): Promise<AdminDoctorDetail | null>;
  /** Pone doctor_profiles.is_bookable = false y users.is_active = false juntos. null si no existe. */
  deactivate(id: string): Promise<AdminDoctorDetail | null>;
}

export const AdminDoctorRepository = Symbol('IAdminDoctorRepository');
