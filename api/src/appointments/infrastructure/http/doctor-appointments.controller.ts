import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AppointmentsService } from '../../application/appointments.service.js';
import { AppointmentWithPatient } from '../../domain/AppointmentWithPatient.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { CurrentAppUser } from '../../../auth/infrastructure/CurrentAppUserDecorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import type { User } from '../../../auth/domain/User.js';
import type { DoctorScheduleBlock } from '../../../doctors/domain/DoctorScheduleRepository.js';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto.js';
import { CreateDoctorAppointmentDto } from './dto/create-doctor-appointment.dto.js';
import { CLINIC_UTC_OFFSET } from '../../domain/ClinicSchedule.js';

// Las fechas del query son días de la clínica (Bolivia), no de UTC: con
// medianoche UTC la semana lunes→lunes cortaba el domingo a las 20:00 y las
// citas de 20:00 a 24:00 de ese día no aparecían en ninguna semana (CLI-148).
function clinicMidnight(date: string): Date {
  return new Date(`${date}T00:00:00${CLINIC_UTC_OFFSET}`);
}

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
      from: query.from ? clinicMidnight(query.from) : undefined,
      to: query.to ? clinicMidnight(query.to) : undefined,
    });
  }

  // CLI-148: agendar es solo del doctor dueño de la agenda — el admin sigue
  // en solo lectura (CLI-64). El doctor sale del token, nunca del body.
  @Post('doctor')
  @Roles(UserRole.ODONTOLOGIST)
  createByDoctor(
    @CurrentAppUser() appUser: User,
    @Body() dto: CreateDoctorAppointmentDto,
  ): Promise<AppointmentWithPatient> {
    return this.appointmentsService.createByDoctor(appUser.id, dto);
  }

  /** CLI-148: horario de atención propio, para marcar en la agenda lo que queda fuera. */
  @Get('my-schedule')
  @Roles(UserRole.ODONTOLOGIST)
  getMySchedule(
    @CurrentAppUser() appUser: User,
  ): Promise<DoctorScheduleBlock[]> {
    return this.appointmentsService.getDoctorSchedule(appUser.id);
  }
}
