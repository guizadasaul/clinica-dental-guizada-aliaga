import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  PaymentsService,
  CheckoutResult,
  PublicStatusResult,
} from '../../application/payments.service.js';

// Sin SupabaseAuthGuard a propósito: visitante sin sesión pagando su reserva (issue CLI-11).
@Controller('public/appointments')
export class PublicCheckoutController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':id/checkout')
  checkout(@Param('id', ParseUUIDPipe) id: string): Promise<CheckoutResult> {
    return this.paymentsService.checkout(id);
  }

  @Get(':id/status')
  getStatus(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublicStatusResult> {
    return this.paymentsService.getPublicStatus(id);
  }
}
