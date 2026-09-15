import { Module } from '@nestjs/common';
import { PatientsController } from './infrastructure/http/patients.controller';
import { PatientsService } from './application/patients.service';
import { PatientRepository } from './domain/PatientRepository';
import { PrismaPatientsRepository } from './infrastructure/persistence/prisma-patients.repository';
import { AuthModule } from '../auth/auth.module';
import { TreatmentsModule } from '../treatments/treatments.module';
import { DiagnosesModule } from '../diagnoses/diagnoses.module';
import { MedicalConditionsModule } from '../medical-conditions/medical-conditions.module';

@Module({
  imports: [AuthModule, TreatmentsModule, DiagnosesModule, MedicalConditionsModule],
  controllers: [PatientsController],
  providers: [
    PatientsService,
    { provide: PatientRepository, useClass: PrismaPatientsRepository },
  ],
  exports: [PatientRepository],
})
export class PatientsModule {}
