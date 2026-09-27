import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PublicCheckoutController } from './infrastructure/http/public-checkout.controller';
import { BanecoWebhookController } from './infrastructure/http/baneco-webhook.controller';
import { PaymentsService } from './application/payments.service';
import { HoldExpiryScheduler } from './application/hold-expiry-scheduler.service';
import { BookingConfirmationRepository } from './domain/BookingConfirmationRepository';
import { BanecoModule } from './baneco.module';
import { PrismaBookingConfirmationRepository } from './infrastructure/persistence/prisma-booking-confirmation.repository';
import { AppointmentsModule } from '../appointments/appointments.module';
import { TreatmentsModule } from '../treatments/treatments.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppointmentsModule,
    TreatmentsModule,
    BanecoModule,
  ],
  controllers: [PublicCheckoutController, BanecoWebhookController],
  providers: [
    PaymentsService,
    HoldExpiryScheduler,
    {
      provide: BookingConfirmationRepository,
      useClass: PrismaBookingConfirmationRepository,
    },
  ],
})
export class PaymentsModule {}
