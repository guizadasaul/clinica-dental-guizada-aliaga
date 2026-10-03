import { Matches } from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** CLI-195: rango de días de la clínica (Bolivia) de los horarios reservados a listar. */
export class ListTimeBlocksQueryDto {
  @Matches(DATE_REGEX, { message: 'from debe tener el formato YYYY-MM-DD' })
  from!: string;

  @Matches(DATE_REGEX, { message: 'to debe tener el formato YYYY-MM-DD' })
  to!: string;
}
