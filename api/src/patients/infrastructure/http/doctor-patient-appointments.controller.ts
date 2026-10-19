import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { PatientsService } from '../../application/patients.service.js';
import { AppointmentsService } from '../../../appointments/application/appointments.service.js';
import type { PatientAppointment } from '../../../appointments/domain/PatientAppointment.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';

/** Cuántas próximas citas se muestran en el historial del paciente. */
const UPCOMING_LIMIT = 10;

export interface PatientAppointmentsOverview {
  upcoming: PatientAppointment[];
  past: PatientAppointment[];
}

/**
 * Citas de un paciente vistas por el doctor (CLI-260): las mismas consultas
 * que usa el panel del paciente, pero por id de ficha, así que sirven también
 * para quien todavía no creó su cuenta.
 */
@Controller('patients/:patientId/appointments')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class DoctorPatientAppointmentsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  @Get()
  @Roles(UserRole.ODONTOLOGIST)
  async findForPatient(
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<PatientAppointmentsOverview> {
    await this.patientsService.assertPatientExists(patientId);
    const [upcoming, past] = await Promise.all([
      this.appointmentsService.getPatientAppointments(
        patientId,
        'upcoming',
        UPCOMING_LIMIT,
      ),
      this.appointmentsService.getPatientVisits(patientId),
    ]);
    return { upcoming, past };
  }
}
