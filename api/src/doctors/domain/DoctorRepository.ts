import type { Doctor } from './Doctor';

export interface IDoctorRepository {
  /** Doctores reservables (is_bookable = true), ordenados por display_order. */
  findBookable(): Promise<Doctor[]>;
  /** true si el id corresponde a un doctor con is_bookable = true hoy. */
  isBookable(doctorId: string): Promise<boolean>;
}

export const DoctorRepository = Symbol('IDoctorRepository');
