import { Module } from '@nestjs/common';
import { TreatmentsController } from './infrastructure/http/treatments.controller';
import { TreatmentsService } from './application/treatments.service';
import { TreatmentRepository } from './domain/TreatmentRepository';
import { PrismaTreatmentsRepository } from './infrastructure/persistence/prisma-treatments.repository';
import { AuthModule } from '../auth/auth.module';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';

@Module({
  imports: [AuthModule, ExchangeRateModule],
  controllers: [TreatmentsController],
  providers: [
    TreatmentsService,
    { provide: TreatmentRepository, useClass: PrismaTreatmentsRepository },
  ],
  exports: [TreatmentRepository],
})
export class TreatmentsModule {}
