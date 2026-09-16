import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class AvailabilityRangeQueryDto {
  @IsUUID()
  doctorId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from debe tener el formato YYYY-MM-DD',
  })
  from!: string;

  // Con transform:true (ver api/src/app.config.ts) y enableImplicitConversion:false,
  // el ValidationPipe ya no hace `new Number(...)` automático — @Type(() => Number)
  // es el que convierte el string de query a number antes de que corran los
  // validadores. El controller ya no necesita el `Number(query.days)` manual.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(14)
  days?: number;
}
