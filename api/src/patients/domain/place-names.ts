import { normalizeFullName } from '../../shared/validators/full-name.validator';

/**
 * Lugar de nacimiento, zona y ciudad (CLI-178): valores que se repiten entre
 * pacientes. Se sugieren los ya usados y, al guardar, el mismo lugar escrito
 * distinto ("cochabamba", "COCHABAMBA ", "Cochabámba") termina guardado igual.
 */
export interface PatientFieldOptions {
  birthPlaces: string[];
  zonas: string[];
  ciudades: string[];
}

/** Clave de comparación: sin mayúsculas, sin tildes y con los espacios colapsados. */
export function placeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Devuelve el valor tal como ya está guardado si coincide por `placeKey` con
 * uno conocido; si no, el valor con mayúscula inicial por palabra y partículas
 * en minúscula ("santa cruz de la sierra" → "Santa Cruz de la Sierra").
 */
export function canonicalPlace(
  value: string,
  known: readonly string[],
): string {
  const key = placeKey(value);
  return known.find((k) => placeKey(k) === key) ?? normalizeFullName(value);
}
