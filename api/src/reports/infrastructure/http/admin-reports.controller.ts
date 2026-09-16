import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from '../../application/reports.service.js';
import type { OperationalReport } from '../../domain/OperationalReport.js';
import type { FinancialReport } from '../../domain/FinancialReport.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { ReportQueryDto } from './dto/report-query.dto.js';

// Toda la ruta es exclusiva de admin (CLI-65), mismo criterio que
// AdminDoctorsController: ninguna de estas rutas la debe poder tocar un
// odontólogo o paciente.
@Controller('admin/reports')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('operational')
  getOperational(@Query() query: ReportQueryDto): Promise<OperationalReport> {
    return this.reportsService.getOperationalReport({
      from: query.from,
      to: query.to,
      ...(query.doctorId && { doctorId: query.doctorId }),
    });
  }

  @Get('financial')
  getFinancial(@Query() query: ReportQueryDto): Promise<FinancialReport> {
    return this.reportsService.getFinancialReport({
      from: query.from,
      to: query.to,
      ...(query.doctorId && { doctorId: query.doctorId }),
    });
  }
}
