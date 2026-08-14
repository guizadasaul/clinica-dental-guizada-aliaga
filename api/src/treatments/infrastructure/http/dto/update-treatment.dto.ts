import { PartialType } from '@nestjs/mapped-types';
import { CreateTreatmentDto } from './create-treatment.dto.js';

export class UpdateTreatmentDto extends PartialType(CreateTreatmentDto) {}
