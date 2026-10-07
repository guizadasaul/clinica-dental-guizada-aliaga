import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/** Ningún DTO del paciente acepta patientId/userId: la identidad sale del actor. */
export class MyAppointmentsArgsDto {
  @IsIn(['upcoming', 'past'])
  scope!: 'upcoming' | 'past';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

export class MyTreatmentsArgsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class MyVisitsArgsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

/**
 * Qué pagar con QR (CLI-236). Por número de presupuesto y de línea, tal como
 * los muestra get_my_quotes: el LLM nunca maneja ids. Sin líneas: el saldo
 * pendiente del presupuesto.
 */
export class CreateMyQrPaymentArgsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  quote?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  lines?: number[];
}
