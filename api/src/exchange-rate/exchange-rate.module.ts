import { Module } from '@nestjs/common';
import { ExchangeRateProvider } from './domain/ExchangeRateProvider';
import { FacturaBoExchangeRateProvider } from './infrastructure/factura-bo-exchange-rate.provider';

@Module({
  providers: [
    { provide: ExchangeRateProvider, useClass: FacturaBoExchangeRateProvider },
  ],
  exports: [ExchangeRateProvider],
})
export class ExchangeRateModule {}
