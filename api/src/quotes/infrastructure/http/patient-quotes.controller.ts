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
import { QuotesService } from '../../application/quotes.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { CreateQuoteDto } from './dto/create-quote.dto.js';

@Controller('patients/:patientId/quotes')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ODONTOLOGIST)
export class PatientQuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateQuoteDto,
  ) {
    return this.quotesService.createForPatient(patientId, dto.notes);
  }

  @Get()
  findByPatient(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.quotesService.findByPatient(patientId);
  }
}
