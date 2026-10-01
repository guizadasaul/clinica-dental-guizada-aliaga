import { Module } from '@nestjs/common';
import { PaymentGateway } from './domain/PaymentGateway';
import { BanecoClient } from './infrastructure/baneco/baneco.client';
import { BanecoPaymentGateway } from './infrastructure/baneco/baneco-payment.gateway';

/**
 * El gateway de BANECO solo, sin reservas ni webhooks (CLI-159): lo comparten
 * PaymentsModule (reservas web) y FinancesModule (cobro de presupuestos) sin
 * que uno tenga que importar al otro.
 */
@Module({
  providers: [
    BanecoClient,
    { provide: PaymentGateway, useClass: BanecoPaymentGateway },
  ],
  exports: [PaymentGateway],
})
export class BanecoModule {}
