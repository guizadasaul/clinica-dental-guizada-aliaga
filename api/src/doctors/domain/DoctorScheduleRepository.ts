/** Fila plana de doctor_schedule_blocks para un doctor puntual. */
export interface DoctorScheduleBlock {
  /** 0 = domingo, ..., 6 = sábado, mismo criterio que ClinicSchedule.ts. */
  weekday: number;
  /** "HH:MM". */
  start: string;
  end: string;
}

export interface IDoctorScheduleRepository {
  findBlocksForDoctor(doctorId: string): Promise<DoctorScheduleBlock[]>;
}

export const DoctorScheduleRepository = Symbol('IDoctorScheduleRepository');
