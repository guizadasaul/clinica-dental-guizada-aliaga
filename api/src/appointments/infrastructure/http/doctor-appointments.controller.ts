import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AppointmentsService } from '../../application/appointments.service.js';
import { AppointmentWithPatient } from '../../domain/AppointmentWithPatient.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto.js';

// Agenda del doctor — distinto del AppointmentsController público (mismo
// prefijo /appointments pero otras rutas, con guard y solo para odontólogos).
@Controller('appointments')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ODONTOLOGIST)
export class DoctorAppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  findForAgenda(
    @Query() query: ListAppointmentsQueryDto,
  ): Promise<AppointmentWithPatient[]> {
    return this.appointmentsService.getAgenda({
      status: query.status,
      from: query.from ? new Date(`${query.from}T00:00:00Z`) : undefined,
      to: query.to ? new Date(`${query.to}T00:00:00Z`) : undefined,
    });
  }
}
