import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PatientsService } from '../../application/patients.service.js';
import { AppointmentsService } from '../../../appointments/application/appointments.service.js';
import type { PatientAppointment } from '../../../appointments/domain/PatientAppointment.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { CurrentUser } from '../../../auth/infrastructure/CurrentUserDecorator.js';
import type { AuthenticatedUser } from '../../../auth/domain/AuthenticatedUser.js';
import { MyAppointmentsQueryDto } from './dto/my-appointments-query.dto.js';

/** Cuántas próximas citas muestra el panel del paciente. */
const UPCOMING_LIMIT = 5;

/**
 * Citas del propio paciente para su panel (CLI-153): mismo read model que usa
 * el chatbot (CLI-91), sin pagos ni datos de otros pacientes. El paciente sale
 * siempre de la sesión, nunca de un parámetro.
 */
@Controller('patients/me/appointments')
@UseGuards(SupabaseAuthGuard)
export class PatientAppointmentsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  /**
   * Próximas citas confirmadas, la más cercana primero (default), o con
   * `?scope=past` el registro de visitas: todas las pasadas, la más reciente
   * primero, con su estado (CLI-209). 404 si no tiene ficha (igual que GET /patients/me).
   */
  @Get()
  async findMine(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: MyAppointmentsQueryDto,
  ): Promise<PatientAppointment[]> {
    const patient = await this.patientsService.findMyPatient(currentUser.uid);
    if (query.scope === 'past') {
      return this.appointmentsService.getPatientVisits(patient.id);
    }
    return this.appointmentsService.getPatientAppointments(
      patient.id,
      'upcoming',
      UPCOMING_LIMIT,
    );
  }
}
