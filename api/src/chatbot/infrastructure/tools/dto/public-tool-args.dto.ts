import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FAQ_TOPICS } from '../../knowledge/clinic-info.js';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class GetFaqArgsDto {
  @IsOptional()
  @IsIn(FAQ_TOPICS)
  topic?: string;
}

export class ListServicesArgsDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}

export class GetAvailableSlotsArgsDto {
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @Matches(DATE_REGEX, { message: 'from debe tener el formato YYYY-MM-DD' })
  from!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(14)
  days?: number;
}

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Fecha y hora en la hora local de la clínica, tal como las muestra
 * get_available_slots: el modelo no tiene que calcular zonas horarias (en la
 * prueba en vivo de CLI-89 armaba mal el ISO con el offset UTC-4).
 */
export class GetBookingLinkArgsDto {
  @IsUUID()
  doctorId!: string;

  @Matches(DATE_REGEX, { message: 'date debe tener el formato YYYY-MM-DD' })
  date!: string;

  @Matches(TIME_REGEX, { message: 'time debe tener el formato HH:mm' })
  time!: string;
}
