import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FinancesService } from '../../application/finances.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { CreateQrChargeDto } from './dto/create-qr-charge.dto.js';
import { ListFinancePatientsQueryDto } from './dto/list-finance-patients-query.dto.js';

/**
 * Finanzas del doctor (CLI-159). Como el resto de presupuestos, cualquier
 * odontólogo puede cobrar a cualquier paciente: el doctor asignado es
 * informativo (CLI-61). El pago en efectivo sigue por POST /quotes/:id/payments.
 */
@Controller('finances')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ODONTOLOGIST)
export class FinancesController {
  constructor(private readonly financesService: FinancesService) {}

  @Get('patients')
  listPatients(@Query() query: ListFinancePatientsQueryDto) {
    return this.financesService.listPatients(query.search);
  }

  @Get('patients/:patientId')
  getPatientDetail(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.financesService.getPatientDetail(patientId);
  }

  @Post('quotes/:quoteId/qr-charges')
  @HttpCode(HttpStatus.CREATED)
  createQrCharge(
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: CreateQrChargeDto,
  ) {
    return this.financesService.createQrCharge(quoteId, dto.amount);
  }

  @Post('qr-charges/:chargeId/verify')
  @HttpCode(HttpStatus.OK)
  verifyQrCharge(@Param('chargeId', ParseUUIDPipe) chargeId: string) {
    return this.financesService.verifyQrCharge(chargeId);
  }

  @Post('qr-charges/:chargeId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelQrCharge(@Param('chargeId', ParseUUIDPipe) chargeId: string) {
    return this.financesService.cancelQrCharge(chargeId);
  }
}
