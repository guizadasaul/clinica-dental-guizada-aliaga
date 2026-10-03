import type { DoctorTimeBlock } from './DoctorTimeBlock';

export interface CreateDoctorTimeBlockData {
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
}

export interface IDoctorTimeBlockRepository {
  create(data: CreateDoctorTimeBlockData): Promise<DoctorTimeBlock>;
  /** Bloqueos del doctor que se solapan con [from, to): empiezan antes de `to` y terminan después de `from`. */
  findOverlapping(
    doctorId: string,
    from: Date,
    to: Date,
  ): Promise<DoctorTimeBlock[]>;
  /** Borra un bloqueo del propio doctor; false si no existe o es de otro. */
  deleteOwn(id: string, doctorId: string): Promise<boolean>;
}

export const DoctorTimeBlockRepository = Symbol('IDoctorTimeBlockRepository');
