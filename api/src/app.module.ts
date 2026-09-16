import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PatientsModule } from './patients/patients.module';
import { TreatmentsModule } from './treatments/treatments.module';
import { DoctorsModule } from './doctors/doctors.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { PaymentsModule } from './payments/payments.module';
import { ExchangeRateModule } from './exchange-rate/exchange-rate.module';
import { QuotesModule } from './quotes/quotes.module';
import { TestimonialsModule } from './testimonials/testimonials.module';
import { DiagnosesModule } from './diagnoses/diagnoses.module';
import { MedicalConditionsModule } from './medical-conditions/medical-conditions.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting (CLI-36) — límite global de referencia, generoso a
    // propósito; los endpoints públicos de escritura sensibles a spam tienen
    // su propio override más estricto vía @Throttle() (ver sus controllers).
    // Storage en memoria (default): se resetea al reiniciar el proceso y es
    // por instancia — alcanza con un solo proceso corriendo, no con varios
    // detrás de un balanceador.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuthModule,
    ExchangeRateModule,
    DiagnosesModule,
    MedicalConditionsModule,
    PatientsModule,
    TreatmentsModule,
    DoctorsModule,
    AppointmentsModule,
    PaymentsModule,
    QuotesModule,
    TestimonialsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
