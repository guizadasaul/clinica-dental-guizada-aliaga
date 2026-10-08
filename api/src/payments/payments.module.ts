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
import { FinancesModule } from '../finances/finances.module';
import { WebConsultationReconciler } from './application/web-consultation-reconciler.service';
import { WebConsultationRepository } from './domain/WebConsultationRepository';
import { PrismaWebConsultationRepository } from './infrastructure/persistence/prisma-web-consultation.repository';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppointmentsModule,
    TreatmentsModule,
    BanecoModule,
    // CLI-220: el webhook también concilia los QR de presupuestos.
    FinancesModule,
  ],
  controllers: [PublicCheckoutController, BanecoWebhookController],
  providers: [
    PaymentsService,
    HoldExpiryScheduler,
    {
      provide: BookingConfirmationRepository,
      useClass: PrismaBookingConfirmationRepository,
    },
    WebConsultationReconciler,
    {
      provide: WebConsultationRepository,
      useClass: PrismaWebConsultationRepository,
    },
  ],
})
export class PaymentsModule {}
