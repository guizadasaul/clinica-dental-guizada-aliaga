import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
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
  // Override del ValidationPipe global (CLI-36, ver api/src/app.config.ts):
  // sin forbidNonWhitelisted. BanecoWebhookDto solo declara { payment: { qrId } },
  // pero el POST real de BANECO trae más campos (monto, fecha, etc.) que no
  // controlamos — con forbidNonWhitelisted:true global, ese payload de
  // terceros empezaría a devolver 400 y el webhook de pagos dejaría de
  // funcionar en producción. Es la única excepción en todo el backend
  // (verificado: es el único endpoint con @Body() alimentado por un tercero).
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async webhook(@Body() dto: BanecoWebhookDto): Promise<BanecoWebhookAck> {
    await this.paymentsService.handleBanecoNotification(dto.payment.qrId);
    return { responseCode: 0, message: 'OK' };
  }
}
