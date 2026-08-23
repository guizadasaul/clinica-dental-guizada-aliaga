import { Controller, Get, UseGuards } from '@nestjs/common';
import { DiagnosesService } from '../../application/diagnoses.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';

@Controller('diagnoses')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class DiagnosesController {
  constructor(private readonly diagnosesService: DiagnosesService) {}

  @Get()
  @Roles(UserRole.ODONTOLOGIST)
  findCatalog() {
    return this.diagnosesService.findCatalog();
  }
}
