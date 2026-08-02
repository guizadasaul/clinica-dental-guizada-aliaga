import {
  IsString,
  IsOptional,
  IsDateString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePatientDto {
  @IsString()
  userId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastNamePaternal: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastNameMaternal?: string;

  @IsDateString()
  birthDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  birthPlace?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  sex?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  occupation?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContactRelationship?: string;

  @IsOptional()
  @IsString()
  consultationReason?: string;

  @IsOptional()
  @IsDateString()
  lastDentistVisit?: string;

  @IsOptional()
  @IsString()
  lastVisitTreatment?: string;

  @IsOptional()
  @IsString()
  familyHistory?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dni?: string;
}
