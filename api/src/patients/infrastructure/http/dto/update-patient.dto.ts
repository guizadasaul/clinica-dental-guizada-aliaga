import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreatePatientDto } from './create-patient.dto.js';

// El correo viene de CreatePatientDto (CLI-181), también opcional acá.
export class UpdatePatientDto extends PartialType(
  OmitType(CreatePatientDto, ['userId'] as const),
) {}
