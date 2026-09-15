import { Controller, Get, UseGuards } from '@nestjs/common';
import { MedicalConditionsService } from '../../application/medical-conditions.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';

@Controller('medical-conditions')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class MedicalConditionsController {
  constructor(
    private readonly medicalConditionsService: MedicalConditionsService,
  ) {}

  @Get()
  @Roles(UserRole.ODONTOLOGIST)
  findCatalog() {
    return this.medicalConditionsService.findCatalog();
  }
}
