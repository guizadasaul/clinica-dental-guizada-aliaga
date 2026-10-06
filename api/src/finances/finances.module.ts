import { Module } from '@nestjs/common';
import { FinancesController } from './infrastructure/http/finances.controller';
import { MyQrChargesController } from './infrastructure/http/my-qr-charges.controller';
import { FinancesService } from './application/finances.service';
import { FinancesReadRepository } from './domain/FinancesReadRepository';
import { PrismaFinancesReadRepository } from './infrastructure/persistence/prisma-finances-read.repository';
import { AuthModule } from '../auth/auth.module';
import { QuotesModule } from '../quotes/quotes.module';
import { BanecoModule } from '../payments/baneco.module';
import { PatientsModule } from '../patients/patients.module';

@Module({
  imports: [AuthModule, QuotesModule, BanecoModule, PatientsModule],
  controllers: [FinancesController, MyQrChargesController],
  providers: [
    FinancesService,
    {
      provide: FinancesReadRepository,
      useClass: PrismaFinancesReadRepository,
    },
  ],
})
export class FinancesModule {}
