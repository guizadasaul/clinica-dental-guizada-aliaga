/** Horario que el doctor aparta de su agenda (CLI-195): emergencia, curso, etc. */
export interface DoctorTimeBlock {
  id: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
}
