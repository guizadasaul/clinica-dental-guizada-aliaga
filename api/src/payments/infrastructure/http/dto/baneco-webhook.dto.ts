import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';
import { AllowUnknownProperties } from '../../../../shared/validators/allow-unknown-properties.js';

/**
 * BANECO no documenta ninguna firma/HMAC en este payload (API Market v1.3.0
 * §7.5, marcada "Opcional"). Se valida el shape mínimo, pero nunca se confía
 * en su contenido — solo se usa qrId como disparador para re-verificar
 * contra GET /v2/statusQR con nuestra propia sesión autenticada.
 */
export class BanecoPaymentDto {
  @IsString()
  qrId!: string;
}

// El POST real de BANECO trae bastante más que { payment: { qrId } } (monto,
// fecha, datos del pagador...) y el banco puede sumar campos sin avisarnos.
// Sin esta marca, el forbidNonWhitelisted global le devolvería 400 y los
// pagos se caerían en producción. El payload igual no se confía: el pago se
// re-verifica contra BANECO dentro de PaymentsService.
@AllowUnknownProperties()
export class BanecoWebhookDto {
  @ValidateNested()
  @Type(() => BanecoPaymentDto)
  payment!: BanecoPaymentDto;
}
