import { applyDecorators } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { NormalizeName } from './transforms.js';
import { IsPersonName } from './full-name.validator.js';

/**
 * Regla de una parte de nombre de persona (nombre, apellido paterno o
 * materno): normaliza mayúsculas/espacios, exige solo letras y 3-100
 * caracteres. Es la misma pila que CreatePatientDto repite campo por campo —
 * acá va compuesta para no copiarla seis veces en los DTOs de doctor (CLI-76).
 * Vive aparte de full-name.validator.ts porque transforms.ts ya importa de ahí.
 */
export function PersonNamePart(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    NormalizeName(),
    IsPersonName(),
    MinLength(3),
    MaxLength(100),
  );
}
