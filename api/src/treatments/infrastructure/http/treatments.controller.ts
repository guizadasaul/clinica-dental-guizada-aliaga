import { Controller, Get, UseGuards } from '@nestjs/common';
import { TreatmentsService } from '../../application/treatments.service.js';
import { FirebaseAuthGuard } from '../../../auth/infrastructure/FirebaseAuthGuard.js';

@Controller('treatments')
@UseGuards(FirebaseAuthGuard)
export class TreatmentsController {
  constructor(private readonly treatmentsService: TreatmentsService) {}

  @Get()
  findAll() {
    return this.treatmentsService.findActive();
  }
}
