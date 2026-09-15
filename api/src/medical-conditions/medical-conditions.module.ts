import { Module } from '@nestjs/common';
import { MedicalConditionsController } from './infrastructure/http/medical-conditions.controller';
import { MedicalConditionsService } from './application/medical-conditions.service';
import { MedicalConditionRepository } from './domain/MedicalConditionRepository';
import { PrismaMedicalConditionsRepository } from './infrastructure/persistence/prisma-medical-conditions.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MedicalConditionsController],
  providers: [
    MedicalConditionsService,
    {
      provide: MedicalConditionRepository,
      useClass: PrismaMedicalConditionsRepository,
    },
  ],
  exports: [MedicalConditionRepository],
})
export class MedicalConditionsModule {}
