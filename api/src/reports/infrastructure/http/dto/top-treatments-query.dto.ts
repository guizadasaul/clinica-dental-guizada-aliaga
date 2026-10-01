import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ReportQueryDto } from './report-query.dto.js';

export class TopTreatmentsQueryDto extends ReportQueryDto {
  // @Type convierte el string del query a number (enableImplicitConversion
  // está apagado, ver AvailabilityRangeQueryDto).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
