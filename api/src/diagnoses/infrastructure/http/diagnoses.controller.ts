import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DiagnosesService } from '../../application/diagnoses.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { CurrentAppUser } from '../../../auth/infrastructure/CurrentAppUserDecorator.js';
import type { User } from '../../../auth/domain/User.js';

const FREQUENT_LIMIT = 8;
const MAX_FREQUENT_LIMIT = 20;

@Controller('diagnoses')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class DiagnosesController {
  constructor(private readonly diagnosesService: DiagnosesService) {}

  @Get()
  @Roles(UserRole.ODONTOLOGIST)
  findCatalog() {
    return this.diagnosesService.findCatalog();
  }

  /** Códigos de los diagnósticos que más usa el doctor logueado (CLI-118). */
  @Get('frequent')
  @Roles(UserRole.ODONTOLOGIST)
  findFrequent(
    @CurrentAppUser() appUser: User,
    @Query('limit', new DefaultValuePipe(FREQUENT_LIMIT), ParseIntPipe)
    limit: number,
  ): Promise<string[]> {
    return this.diagnosesService.findFrequentCodes(
      appUser.id,
      Math.min(Math.max(limit, 1), MAX_FREQUENT_LIMIT),
    );
  }
}
