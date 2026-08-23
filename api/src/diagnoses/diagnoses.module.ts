import { Module } from '@nestjs/common';
import { DiagnosesController } from './infrastructure/http/diagnoses.controller';
import { DiagnosesService } from './application/diagnoses.service';
import { DiagnosisRepository } from './domain/DiagnosisRepository';
import { PrismaDiagnosesRepository } from './infrastructure/persistence/prisma-diagnoses.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DiagnosesController],
  providers: [
    DiagnosesService,
    { provide: DiagnosisRepository, useClass: PrismaDiagnosesRepository },
  ],
  exports: [DiagnosisRepository],
})
export class DiagnosesModule {}
