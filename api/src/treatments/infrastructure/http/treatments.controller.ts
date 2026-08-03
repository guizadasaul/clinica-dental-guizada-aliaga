import { Controller, Get, UseGuards } from '@nestjs/common';
import { TreatmentsService } from '../../application/treatments.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';

@Controller('treatments')
@UseGuards(SupabaseAuthGuard)
export class TreatmentsController {
  constructor(private readonly treatmentsService: TreatmentsService) {}

  @Get()
  findAll() {
    return this.treatmentsService.findActive();
  }
}
