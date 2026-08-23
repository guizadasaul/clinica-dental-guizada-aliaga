import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  EmptyToUndefined,
  Trim,
} from '../../../../shared/validators/transforms.js';
import { BRUSHING_FREQUENCIES } from '../../../../shared/validators/clinical-options.js';

export class CreateHygieneHabitsDto {
  @IsOptional()
  @IsBoolean()
  usesToothbrush?: boolean;

  // Códigos estables en vez del texto visible con tildes que se guardaba
  // hoy ("1 vez al día"). Regla cruzada: obligatorio si se marca que sí usa
  // cepillo — hoy, si se marca el cepillo y no se elige frecuencia, se manda
  // undefined en silencio.
  //
  // La condición incluye "o vino un valor" a propósito: class-validator
  // aplica un único @ValidateIf a TODOS los validadores de la propiedad, así
  // que con solo `usesToothbrush === true` un envío con
  // `{ usesToothbrush: false, brushingFrequency: '<script>…' }` salteaba
  // también @IsIn/@MaxLength y llegaba sin validar a una columna VARCHAR(100).
  @ValidateIf(
    (o: CreateHygieneHabitsDto) =>
      o.usesToothbrush === true || o.brushingFrequency != null,
  )
  @EmptyToUndefined()
  @Trim()
  @IsNotEmpty({
    message: 'brushingFrequency es obligatorio si se usa cepillo de dientes',
  })
  @IsIn(BRUSHING_FREQUENCIES)
  @MaxLength(30)
  brushingFrequency?: string;

  @IsOptional()
  @IsBoolean()
  usesDentalFloss?: boolean;

  @IsOptional()
  @IsBoolean()
  usesToothpick?: boolean;

  @IsOptional()
  @IsBoolean()
  brushesTongue?: boolean;

  @IsOptional()
  @IsBoolean()
  usesMouthwash?: boolean;
}
