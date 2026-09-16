import { Module } from '@nestjs/common';
import { DoctorsController } from './infrastructure/http/doctors.controller';
import { DoctorRepository } from './domain/DoctorRepository';
import { DoctorScheduleRepository } from './domain/DoctorScheduleRepository';
import { PrismaDoctorRepository } from './infrastructure/persistence/prisma-doctor.repository';
import { PrismaDoctorScheduleRepository } from './infrastructure/persistence/prisma-doctor-schedule.repository';

@Module({
  controllers: [DoctorsController],
  providers: [
    { provide: DoctorRepository, useClass: PrismaDoctorRepository },
    {
      provide: DoctorScheduleRepository,
      useClass: PrismaDoctorScheduleRepository,
    },
  ],
  exports: [DoctorRepository, DoctorScheduleRepository],
})
export class DoctorsModule {}
