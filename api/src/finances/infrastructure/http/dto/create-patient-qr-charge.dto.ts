import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/** CLI-218: los tratamientos (claves de línea del presupuesto) que el paciente quiere pagar. */
export class CreatePatientQrChargeDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Elige al menos un tratamiento' })
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  lineKeys!: string[];
}
