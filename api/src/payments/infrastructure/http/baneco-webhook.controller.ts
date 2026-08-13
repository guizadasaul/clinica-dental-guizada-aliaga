import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PaymentsService } from '../../application/payments.service.js';
import { BanecoWebhookDto } from './dto/baneco-webhook.dto.js';

interface BanecoWebhookAck {
  responseCode: number;
  message: string;
}

// Sin SupabaseAuthGuard: lo llama BANECO, no un usuario de la app. La
// autenticidad no se verifica sobre este payload (no viene firmado) — se
// re-verifica el pago contra BANECO mismo dentro de PaymentsService.
@Controller('payments/baneco')
export class BanecoWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Body() dto: BanecoWebhookDto): Promise<BanecoWebhookAck> {
    await this.paymentsService.handleBanecoNotification(dto.payment.qrId);
    return { responseCode: 0, message: 'OK' };
  }
}
