import { Module } from '@nestjs/common';
import { PatientsController } from './infrastructure/http/patients.controller';
import { PatientsService } from './application/patients.service';
import { PatientRepository } from './domain/PatientRepository';
import { PrismaPatientsRepository } from './infrastructure/persistence/prisma-patients.repository';
import { AuthModule } from '../auth/auth.module';
import { TreatmentsModule } from '../treatments/treatments.module';
import { DiagnosesModule } from '../diagnoses/diagnoses.module';
import { MedicalConditionsModule } from '../medical-conditions/medical-conditions.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PatientAppointmentsController } from './infrastructure/http/patient-appointments.controller';

@Module({
  imports: [
    AuthModule,
    TreatmentsModule,
    DiagnosesModule,
    MedicalConditionsModule,
    AppointmentsModule,
  ],
  // PatientAppointmentsController va primero: su ruta fija (me/appointments)
  // no debe competir con las rutas con parámetro de PatientsController.
  controllers: [PatientAppointmentsController, PatientsController],
  providers: [
    PatientsService,
    { provide: PatientRepository, useClass: PrismaPatientsRepository },
  ],
  // PatientsService lo usan las tools del paciente del chatbot (CLI-91).
  exports: [PatientRepository, PatientsService],
})
export class PatientsModule {}
