import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TreatmentsService } from '../../application/treatments.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { CurrentAppUser } from '../../../auth/infrastructure/CurrentAppUserDecorator.js';
import type { User } from '../../../auth/domain/User.js';

const FREQUENT_LIMIT = 8;
const MAX_FREQUENT_LIMIT = 20;
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

  /** Ids de los tratamientos que más usa el doctor logueado (CLI-118). */
  @Get('frequent')
  @Roles(UserRole.ODONTOLOGIST)
  findFrequent(
    @CurrentAppUser() appUser: User,
    @Query('limit', new DefaultValuePipe(FREQUENT_LIMIT), ParseIntPipe)
    limit: number,
  ): Promise<string[]> {
    return this.treatmentsService.findFrequentIds(
      appUser.id,
      Math.min(Math.max(limit, 1), MAX_FREQUENT_LIMIT),
    );
  }

  @Post()
  @Roles(UserRole.ODONTOLOGIST)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTreatmentDto) {
    return this.treatmentsService.create({
      code: dto.code,
      name: dto.name,
      description: dto.description,
      basePrice: dto.basePrice,
      estimatedMinutes: dto.estimatedMinutes,
      applicationType: dto.applicationType,
      currency: dto.currency,
      categoryCode: dto.categoryCode,
      displayOrder: dto.displayOrder,
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
      code: dto.code,
      name: dto.name,
      description: dto.description,
      basePrice: dto.basePrice,
      estimatedMinutes: dto.estimatedMinutes,
      applicationType: dto.applicationType,
      currency: dto.currency,
      categoryCode: dto.categoryCode,
      displayOrder: dto.displayOrder,
      isActive: dto.isActive,
    });
  }
}
