import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminReportsController } from './infrastructure/http/admin-reports.controller';
import { ReportsService } from './application/reports.service';
import { ReportsRepository } from './domain/ReportsRepository';
import { PrismaReportsRepository } from './infrastructure/persistence/prisma-reports.repository';

// AuthModule solo provee los guards (SupabaseAuthGuard/RolesGuard) que usa
// el controller vía @UseGuards — este módulo no necesita nada más de auth
// (a diferencia de admin/, que también usa PatientInvitesService).
@Module({
  imports: [AuthModule],
  controllers: [AdminReportsController],
  providers: [
    ReportsService,
    {
      provide: ReportsRepository,
      useClass: PrismaReportsRepository,
    },
  ],
  // ReportsService lo usan las tools del doctor del chatbot (CLI-92).
  exports: [ReportsService],
})
export class ReportsModule {}
