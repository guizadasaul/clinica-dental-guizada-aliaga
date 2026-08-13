import { Module } from '@nestjs/common';
import { AppointmentsController } from './infrastructure/http/appointments.controller';
import { DoctorAppointmentsController } from './infrastructure/http/doctor-appointments.controller';
import { AppointmentsService } from './application/appointments.service';
import { AppointmentRepository } from './domain/AppointmentRepository';
import { PrismaAppointmentsRepository } from './infrastructure/persistence/prisma-appointments.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AppointmentsController, DoctorAppointmentsController],
  providers: [
    AppointmentsService,
    { provide: AppointmentRepository, useClass: PrismaAppointmentsRepository },
  ],
  exports: [AppointmentsService, AppointmentRepository],
})
export class AppointmentsModule {}
