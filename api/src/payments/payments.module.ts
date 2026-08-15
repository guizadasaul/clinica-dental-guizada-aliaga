import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PublicCheckoutController } from './infrastructure/http/public-checkout.controller';
import { BanecoWebhookController } from './infrastructure/http/baneco-webhook.controller';
import { PaymentsService } from './application/payments.service';
import { ExpiredHoldsSweepService } from './application/expired-holds-sweep.service';
import { PaymentGateway } from './domain/PaymentGateway';
import { BookingConfirmationRepository } from './domain/BookingConfirmationRepository';
import { BanecoClient } from './infrastructure/baneco/baneco.client';
import { BanecoPaymentGateway } from './infrastructure/baneco/baneco-payment.gateway';
import { PrismaBookingConfirmationRepository } from './infrastructure/persistence/prisma-booking-confirmation.repository';
import { AppointmentsModule } from '../appointments/appointments.module';
import { TreatmentsModule } from '../treatments/treatments.module';

@Module({
  imports: [ScheduleModule.forRoot(), AppointmentsModule, TreatmentsModule],
  controllers: [PublicCheckoutController, BanecoWebhookController],
  providers: [
    PaymentsService,
    ExpiredHoldsSweepService,
    BanecoClient,
    { provide: PaymentGateway, useClass: BanecoPaymentGateway },
    {
      provide: BookingConfirmationRepository,
      useClass: PrismaBookingConfirmationRepository,
    },
  ],
})
export class PaymentsModule {}
