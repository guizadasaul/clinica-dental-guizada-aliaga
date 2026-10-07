import { IsIn, IsOptional } from 'class-validator';

export class MyAppointmentsQueryDto {
  /** CLI-209: `upcoming` (default) las próximas; `past` el registro de visitas. */
  @IsOptional()
  @IsIn(['upcoming', 'past'])
  scope?: 'upcoming' | 'past';
}
