import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import {
  EmptyToUndefined,
  Trim,
} from '../../../../shared/validators/transforms.js';
import { NoHtml } from '../../../../shared/validators/text-safety.validator.js';
import {
  TOOTH_CONDITIONS,
  TOOTH_TYPES,
} from '../../../../shared/validators/clinical-options.js';
import {
  IsFdiToothNumber,
  toothTypeFor,
} from '../../../../shared/validators/tooth.validator.js';

// 32 dientes permanentes + 20 temporales = 52 posibles entries por paciente
// (dentición mixta, el máximo teórico de dientes distintos en un odontograma).
const MAX_ENTRIES = 52;

/**
 * toothType, si viene, tiene que coincidir con el cuadrante de toothNumber
 * (ver toothTypeFor en shared/validators/tooth.validator.ts). Hoy se puede
 * marcar "temporal" sobre un diente permanente y queda una fila incoherente.
 * Específico de este DTO (no del toolkit compartido): no tiene sentido
 * fuera de la combinación toothNumber+toothType de una entry de odontograma.
 */
function IsConsistentToothType(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isConsistentToothType',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (value === undefined || value === null) return true;
          const { toothNumber } = args.object as CreateOdontogramEntryDto;
          if (typeof toothNumber !== 'number') return true; // lo valida IsFdiToothNumber
          const expected = toothTypeFor(toothNumber);
          return expected === null || value === expected;
        },
        defaultMessage(args: ValidationArguments): string {
          const { toothNumber } = args.object as CreateOdontogramEntryDto;
          const expected = toothTypeFor(toothNumber);
          return `toothType tiene que ser "${expected}" para el diente ${toothNumber}.`;
        },
      },
    });
  };
}

/** Ningún toothNumber repetido dentro del mismo envío. */
function HasUniqueToothNumbers(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'hasUniqueToothNumbers',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value)) return true; // lo valida @IsArray()
          const numbers = (value as { toothNumber?: unknown }[])
            .map((entry) => entry?.toothNumber)
            .filter((n): n is number => typeof n === 'number');
          return new Set(numbers).size === numbers.length;
        },
        defaultMessage(): string {
          return 'No puede haber dientes repetidos en entries.';
        },
      },
    });
  };
}

export class CreateOdontogramEntryDto {
  @IsInt()
  @Min(11)
  @Max(85)
  @IsFdiToothNumber()
  toothNumber: number;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @IsIn(TOOTH_TYPES)
  @MaxLength(20)
  @IsConsistentToothType()
  toothType?: string;

  @IsIn(TOOTH_CONDITIONS)
  toothCondition: string;

  @IsString()
  @Trim()
  @Length(3, 500)
  diagnosisDescription: string;

  @IsUUID()
  @IsOptional()
  treatmentId?: string;

  // La columna es Decimal(10,2): sin este tope Postgres redondea en
  // silencio con más de 2 decimales y falla directo con 10+ dígitos.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(99999999.99)
  customPrice?: number;

  @IsOptional()
  @EmptyToUndefined()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @NoHtml()
  notes?: string;
}

export class CreateOdontogramEntriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ENTRIES)
  @HasUniqueToothNumbers()
  @ValidateNested({ each: true })
  @Type(() => CreateOdontogramEntryDto)
  entries: CreateOdontogramEntryDto[];
}
