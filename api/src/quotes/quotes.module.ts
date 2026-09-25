import { Module } from '@nestjs/common';
import { QuotesController } from './infrastructure/http/quotes.controller';
import { PatientQuotesController } from './infrastructure/http/patient-quotes.controller';
import { QuotesService } from './application/quotes.service';
import { QuoteRepository } from './domain/QuoteRepository';
import { PrismaQuotesRepository } from './infrastructure/persistence/prisma-quotes.repository';
import { AuthModule } from '../auth/auth.module';
import { TreatmentsModule } from '../treatments/treatments.module';
import { PatientsModule } from '../patients/patients.module';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';

@Module({
  imports: [AuthModule, TreatmentsModule, PatientsModule, ExchangeRateModule],
  controllers: [QuotesController, PatientQuotesController],
  providers: [
    QuotesService,
    { provide: QuoteRepository, useClass: PrismaQuotesRepository },
  ],
  // QuotesService lo usan las tools del paciente del chatbot (CLI-91).
  exports: [QuotesService],
})
export class QuotesModule {}
