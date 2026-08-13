import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsEmail, IsOptional, MaxLength } from 'class-validator';
import { CreatePatientDto } from './create-patient.dto.js';

export class UpdatePatientDto extends PartialType(
  OmitType(CreatePatientDto, ['userId'] as const),
) {
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;
}
