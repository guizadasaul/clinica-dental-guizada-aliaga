import { Controller, Get, UseGuards } from '@nestjs/common';
import { QuotesService } from '../../application/quotes.service.js';
import type { Quote } from '../../domain/Quote.js';
import { PatientsService } from '../../../patients/application/patients.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { CurrentUser } from '../../../auth/infrastructure/CurrentUserDecorator.js';
import type { AuthenticatedUser } from '../../../auth/domain/AuthenticatedUser.js';

/**
 * Presupuestos del propio paciente para su panel (CLI-156): solo los que el
 * doctor ya compartió, nunca borradores. El paciente sale siempre de la
 * sesión, nunca de un parámetro.
 */
@Controller('patients/me/quotes')
@UseGuards(SupabaseAuthGuard)
export class MyQuotesController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly quotesService: QuotesService,
  ) {}

  /** Más recientes primero. 404 si no tiene ficha (igual que GET /patients/me). */
  @Get()
  async findMine(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<Quote[]> {
    const patient = await this.patientsService.findMyPatient(currentUser.uid);
    return this.quotesService.findSharedByPatient(patient.id);
  }
}
