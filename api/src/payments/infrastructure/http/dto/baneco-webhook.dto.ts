import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';

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

export class BanecoWebhookDto {
  @ValidateNested()
  @Type(() => BanecoPaymentDto)
  payment!: BanecoPaymentDto;
}
