import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  PatientInvitesService,
  CreateInviteResult,
} from '../../application/patient-invites.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { CreateInviteDto } from './dto/create-invite.dto.js';

@Controller('patients')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class PatientInvitesController {
  constructor(private readonly patientInvitesService: PatientInvitesService) {}

  @Post(':id/invites')
  @Roles(UserRole.ODONTOLOGIST)
  @HttpCode(HttpStatus.CREATED)
  createInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInviteDto,
  ): Promise<CreateInviteResult> {
    return this.patientInvitesService.createInvite(id, dto.channel);
  }
}
