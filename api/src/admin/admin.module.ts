import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminDoctorsController } from './infrastructure/http/admin-doctors.controller';
import { AdminDoctorsService } from './application/admin-doctors.service';
import { AdminDoctorRepository } from './domain/AdminDoctorRepository';
import { PrismaAdminDoctorRepository } from './infrastructure/persistence/prisma-admin-doctor.repository';

// AuthModule provee SupabaseAuthGuard/RolesGuard (el controller los usa vía
// @UseGuards) y PatientInvitesService (el service lo usa para mandar la
// invitación de alta) — los tres ya están en sus `exports` (CLI-62 agregó
// PatientInvitesService).
@Module({
  imports: [AuthModule],
  controllers: [AdminDoctorsController],
  providers: [
    AdminDoctorsService,
    {
      provide: AdminDoctorRepository,
      useClass: PrismaAdminDoctorRepository,
    },
  ],
})
export class AdminModule {}
