import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '../../../domain/PaymentMethod.js';

export class AddPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  /**
   * Solo efectivo por esta vía (CLI-159): el QR BANECO se registra solo al
   * verificarlo contra el banco (POST /finances/qr-charges/:id/verify), nunca
   * a mano. Por defecto, efectivo.
   */
  @IsOptional()
  @IsIn([PaymentMethod.CASH])
  paymentMethod?: typeof PaymentMethod.CASH;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
