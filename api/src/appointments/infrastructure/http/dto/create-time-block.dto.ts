import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  EmptyToUndefined,
  NormalizeText,
} from '../../../../shared/validators/transforms.js';
import { NoHtml } from '../../../../shared/validators/text-safety.validator.js';

/** CLI-195: horario que el doctor aparta de su agenda. El doctor sale del token, nunca del body. */
export class CreateTimeBlockDto {
  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsISO8601({ strict: true })
  endsAt!: string;

  /** Opcional: emergencia, curso, etc. */
  @IsOptional()
  @EmptyToUndefined()
  @NormalizeText()
  @IsString()
  @MaxLength(200)
  @NoHtml()
  reason?: string;
}
