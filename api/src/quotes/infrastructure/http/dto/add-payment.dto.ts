import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '../../../domain/PaymentMethod.js';

export class AddPaymentDto {
  /**
   * CLI-261: los tratamientos (claves de línea del presupuesto) que se pagan,
   * cada uno por su saldo completo; el monto sale de ahí, no se escribe.
   */
  @IsArray()
  @ArrayNotEmpty({ message: 'Elige al menos un tratamiento' })
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  lineKeys!: string[];

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
