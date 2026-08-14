import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TreatmentsService } from '../../application/treatments.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { CreateTreatmentDto } from './dto/create-treatment.dto.js';
import { UpdateTreatmentDto } from './dto/update-treatment.dto.js';

@Controller('treatments')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class TreatmentsController {
  constructor(private readonly treatmentsService: TreatmentsService) {}

  @Get()
  findAll() {
    return this.treatmentsService.findActive();
  }

  @Post()
  @Roles(UserRole.ODONTOLOGIST)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTreatmentDto) {
    return this.treatmentsService.create({
      name: dto.name,
      description: dto.description,
      basePrice: dto.basePrice,
      estimatedMinutes: dto.estimatedMinutes,
      scope: dto.scope,
      currency: dto.currency,
      isActive: dto.isActive,
    });
  }

  @Patch(':id')
  @Roles(UserRole.ODONTOLOGIST)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTreatmentDto,
  ) {
    return this.treatmentsService.update(id, {
      name: dto.name,
      description: dto.description,
      basePrice: dto.basePrice,
      estimatedMinutes: dto.estimatedMinutes,
      scope: dto.scope,
      currency: dto.currency,
      isActive: dto.isActive,
    });
  }
}
