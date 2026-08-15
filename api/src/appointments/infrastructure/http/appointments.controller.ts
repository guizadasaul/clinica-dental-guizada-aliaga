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
  Query,
} from '@nestjs/common';
import {
  AppointmentsService,
  AvailabilityRangeResult,
  AvailabilityResult,
  HoldResult,
} from '../../application/appointments.service.js';
import { Appointment } from '../../domain/Appointment.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import { AvailabilityRangeQueryDto } from './dto/availability-range-query.dto.js';
import { GuestContactDto } from './dto/guest-contact.dto.js';
import { HoldSlotDto } from './dto/hold-slot.dto.js';

const DEFAULT_RANGE_DAYS = 14;

// Sin SupabaseAuthGuard a propósito: estos endpoints son para un visitante sin
// sesión que todavía no tiene cuenta ni Patient (issue CLI-10).
@Controller('public')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get('availability')
  getAvailability(
    @Query() query: AvailabilityQueryDto,
  ): Promise<AvailabilityResult> {
    return this.appointmentsService.getAvailability(query.date);
  }

  @Get('availability-range')
  getAvailabilityRange(
    @Query() query: AvailabilityRangeQueryDto,
  ): Promise<AvailabilityRangeResult> {
    return this.appointmentsService.getAvailabilityRange(
      query.from,
      query.days ? Number(query.days) : DEFAULT_RANGE_DAYS,
    );
  }

  @Post('appointments/hold')
  @HttpCode(HttpStatus.CREATED)
  holdSlot(@Body() dto: HoldSlotDto): Promise<HoldResult> {
    return this.appointmentsService.holdSlot(dto.slot);
  }

  @Patch('appointments/:id/contact')
  saveGuestContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuestContactDto,
  ): Promise<Appointment> {
    return this.appointmentsService.saveGuestContact(
      id,
      dto.fullName,
      dto.phone,
    );
  }
}
