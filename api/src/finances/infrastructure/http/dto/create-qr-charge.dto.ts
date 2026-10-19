import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/** CLI-261: los tratamientos que el doctor cobra con QR, cada uno por su saldo completo. */
export class CreateQrChargeDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Elige al menos un tratamiento' })
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  lineKeys!: string[];
}
