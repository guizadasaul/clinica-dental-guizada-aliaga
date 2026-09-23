import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AppointmentsService } from '../../application/appointments.service.js';
import { AppointmentWithPatient } from '../../domain/AppointmentWithPatient.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { CurrentAppUser } from '../../../auth/infrastructure/CurrentAppUserDecorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import type { User } from '../../../auth/domain/User.js';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto.js';

// Agenda del doctor — distinto del AppointmentsController público (mismo
// prefijo /appointments pero otras rutas, con guard y solo para odontólogos
// y, desde CLI-64, admin en modo solo lectura sobre la agenda de cualquier doctor).
@Controller('appointments')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ODONTOLOGIST, UserRole.ADMIN)
export class DoctorAppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  findForAgenda(
    @CurrentAppUser() appUser: User,
    @Query() query: ListAppointmentsQueryDto,
  ): Promise<AppointmentWithPatient[]> {
    // CLI-110: la agenda común (scope=all) no filtra por doctor — coherente
    // con que cualquier odontólogo ya ve a todos los pacientes (CLI-58).
    // CLI-64: si no, solo un ADMIN puede pedir la agenda de otro doctor vía
    // doctorId; un odontólogo lo manda o no, siempre ve la propia.
    let doctorId: string | undefined;
    if (query.scope !== 'all') {
      doctorId =
        appUser.role === UserRole.ADMIN && query.doctorId
          ? query.doctorId
          : appUser.id;
    }

    return this.appointmentsService.getAgenda({
      doctorId,
      status: query.status,
      from: query.from ? new Date(`${query.from}T00:00:00Z`) : undefined,
      to: query.to ? new Date(`${query.to}T00:00:00Z`) : undefined,
    });
  }
}
