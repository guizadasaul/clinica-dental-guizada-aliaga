import { IsOptional, IsString, Matches } from 'class-validator';

export class AvailabilityRangeQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from debe tener el formato YYYY-MM-DD',
  })
  from!: string;

  // String a propósito (el ValidationPipe global no usa transform: true) —
  // el service la parsea y la acota a [1, 14].
  @IsOptional()
  @Matches(/^([1-9]|1[0-4])$/, { message: 'days debe ser un entero entre 1 y 14' })
  days?: string;
}
