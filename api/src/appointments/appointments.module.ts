import { Module } from '@nestjs/common';
import { AppointmentsController } from './infrastructure/http/appointments.controller';
import { AppointmentsService } from './application/appointments.service';
import { AppointmentRepository } from './domain/AppointmentRepository';
import { PrismaAppointmentsRepository } from './infrastructure/persistence/prisma-appointments.repository';

@Module({
  controllers: [AppointmentsController],
  providers: [
    AppointmentsService,
    { provide: AppointmentRepository, useClass: PrismaAppointmentsRepository },
  ],
  exports: [AppointmentsService, AppointmentRepository],
})
export class AppointmentsModule {}
