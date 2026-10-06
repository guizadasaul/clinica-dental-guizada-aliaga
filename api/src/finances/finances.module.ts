import { Module } from '@nestjs/common';
import { FinancesController } from './infrastructure/http/finances.controller';
import { MyQrChargesController } from './infrastructure/http/my-qr-charges.controller';
import { FinancesService } from './application/finances.service';
import { QrChargeReconciler } from './application/qr-charge-reconciler.service';
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
    QrChargeReconciler,
    {
      provide: FinancesReadRepository,
      useClass: PrismaFinancesReadRepository,
    },
  ],
  // CLI-220: el webhook de BANECO (PaymentsModule) también concilia los QR de presupuestos.
  exports: [QrChargeReconciler],
})
export class FinancesModule {}
