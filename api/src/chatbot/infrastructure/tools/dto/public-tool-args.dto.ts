import {
  IsIn,
  IsInt,
  IsISO8601,
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

export class NoArgsDto {}

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

export class GetBookingLinkArgsDto {
  @IsUUID()
  doctorId!: string;

  @IsISO8601({ strict: true })
  slot!: string;
}
