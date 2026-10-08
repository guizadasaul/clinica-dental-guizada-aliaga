// El nombre público del doctor se carga con su título ("Dra. María López",
// CreateDoctorDto). El saludo tomaba la primera palabra y le anteponía "Dr.",
// y salía "Dr. Dra." (CLI-254).
const TITLE = /^(dra|doctora|dr|doctor)\.?$/i;
const UNDECIDED_TITLE = /^dr\.?\/dra\.?$/i;

/** Título normalizado: "Dra." para doctora, "Dr." para doctor. */
function normalizeTitle(word: string): string {
  return /^(dra|doctora)/i.test(word) ? 'Dra.' : 'Dr.';
}

/**
 * Cómo saludar al doctor en su panel: con su título si lo trae el nombre
 * público ("Dra. María"), o solo con su primer nombre si no ("Lucía"), para
 * no adivinar si es doctor o doctora. Sin nombre, "Doctor".
 */
export function doctorGreetingName(displayName: string | null | undefined): string {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  // "Dr./Dra." es la sugerencia del alta que quedó sin elegir: no dice si es
  // doctor o doctora, así que se saluda solo por el nombre.
  if (UNDECIDED_TITLE.test(words[0] ?? '')) {
    words.shift();
    return words[0] ?? 'Doctor';
  }
  if (words.length === 0) {
    return 'Doctor';
  }
  if (TITLE.test(words[0])) {
    return words.length > 1 ? `${normalizeTitle(words[0])} ${words[1]}` : 'Doctor';
  }
  return words[0];
}
