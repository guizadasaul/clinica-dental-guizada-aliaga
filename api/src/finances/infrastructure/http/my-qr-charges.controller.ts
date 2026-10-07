import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FinancesService } from '../../application/finances.service.js';
import { PatientsService } from '../../../patients/application/patients.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { CurrentUser } from '../../../auth/infrastructure/CurrentUserDecorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import type { AuthenticatedUser } from '../../../auth/domain/AuthenticatedUser.js';
import { CreatePatientQrChargeDto } from './dto/create-patient-qr-charge.dto.js';

/**
 * El paciente paga con QR BANECO los tratamientos que elige en "Mi
 * presupuesto" (CLI-218). Mismo cobro que Finanzas del doctor (CLI-159),
 * con el paciente sacado siempre de la sesión. Sin polling: se confirma con
 * el botón "Verificar pago".
 */
@Controller('patients/me')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.PATIENT)
export class MyQrChargesController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly financesService: FinancesService,
  ) {}

  @Post('quotes/:quoteId/qr-charges')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: CreatePatientQrChargeDto,
  ) {
    const patient = await this.patientsService.findMyPatient(currentUser.uid);
    return this.financesService.createPatientQrCharge(
      patient.id,
      quoteId,
      dto.lineKeys,
    );
  }

  @Get('qr-charges/pending')
  async findPending(@CurrentUser() currentUser: AuthenticatedUser) {
    const patient = await this.patientsService.findMyPatient(currentUser.uid);
    return this.financesService.getPendingPatientQrCharge(patient.id);
  }

  @Post('qr-charges/:chargeId/verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('chargeId', ParseUUIDPipe) chargeId: string,
  ) {
    const patient = await this.patientsService.findMyPatient(currentUser.uid);
    return this.financesService.verifyPatientQrCharge(patient.id, chargeId);
  }

  // CLI-220: cerrar el QR lo anula de forma segura — si BANECO ya lo había
  // cobrado, se registra el pago y vuelve { status: 'paid', quote }.
  @Post('qr-charges/:chargeId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('chargeId', ParseUUIDPipe) chargeId: string,
  ) {
    const patient = await this.patientsService.findMyPatient(currentUser.uid);
    return this.financesService.cancelPatientQrCharge(patient.id, chargeId);
  }
}
