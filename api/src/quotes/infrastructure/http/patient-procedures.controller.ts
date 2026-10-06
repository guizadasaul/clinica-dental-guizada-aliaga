import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TreatmentPlanService } from '../../application/treatment-plan.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { CurrentUser } from '../../../auth/infrastructure/CurrentUserDecorator.js';
import type { AuthenticatedUser } from '../../../auth/domain/AuthenticatedUser.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { CreateToothProcedureDto } from '../../../patients/infrastructure/http/dto/create-tooth-procedure.dto.js';

/**
 * Registrar un tratamiento realizado (CLI-226). Vive en el módulo de
 * presupuestos porque cumple o suma la línea del presupuesto en la misma
 * transacción; la ruta es la misma de siempre.
 */
@Controller('patients/:patientId/tooth-procedures')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class PatientProceduresController {
  constructor(private readonly treatmentPlan: TreatmentPlanService) {}

  @Post()
  @Roles(UserRole.ODONTOLOGIST)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateToothProcedureDto,
  ) {
    return this.treatmentPlan.registerProcedure(patientId, currentUser.uid, {
      teeth: dto.teeth.map((t) => ({
        number: t.number,
        surfaces: t.surfaces,
      })),
      treatmentId: dto.treatmentId,
      priceCharged: dto.priceCharged,
      quantity: dto.quantity,
      procedureDate: dto.procedureDate
        ? new Date(dto.procedureDate)
        : undefined,
      notes: dto.notes,
    });
  }
}
