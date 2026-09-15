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
import { Throttle } from '@nestjs/throttler';
import {
  AppointmentsService,
  AvailabilityRangeResult,
  AvailabilityResult,
  HoldResult,
} from '../../application/appointments.service.js';
import { Appointment } from '../../domain/Appointment.js';
import { readEnvInt } from '../../../shared/env.util.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import { AvailabilityRangeQueryDto } from './dto/availability-range-query.dto.js';
import { GuestContactDto } from './dto/guest-contact.dto.js';
import { HoldSlotDto } from './dto/hold-slot.dto.js';

const DEFAULT_RANGE_DAYS = 14;
const HOUR_MS = 3_600_000;

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
      query.days ?? DEFAULT_RANGE_DAYS,
    );
  }

  @Post('appointments/hold')
  @HttpCode(HttpStatus.CREATED)
  // 5/hora por IP (CLI-36). Ver comentario de rate limit en el mismo
  // patrón en TestimonialsController.create().
  @Throttle({
    default: {
      limit: () => readEnvInt('THROTTLE_APPOINTMENTS_HOLD_PER_HOUR', 5),
      ttl: HOUR_MS,
    },
  })
  holdSlot(@Body() dto: HoldSlotDto): Promise<HoldResult> {
    return this.appointmentsService.holdSlot(dto.slot);
  }

  @Patch('appointments/:id/contact')
  // 10/hora por IP (CLI-36).
  @Throttle({
    default: {
      limit: () => readEnvInt('THROTTLE_APPOINTMENTS_CONTACT_PER_HOUR', 10),
      ttl: HOUR_MS,
    },
  })
  saveGuestContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuestContactDto,
  ): Promise<Appointment> {
    return this.appointmentsService.saveGuestContact(
      id,
      dto.firstName,
      dto.lastNamePaternal,
      dto.lastNameMaternal ?? null,
      dto.phone,
      dto.email ?? null,
    );
  }
}
