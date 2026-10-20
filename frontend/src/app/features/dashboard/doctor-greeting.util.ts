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
 * Cómo saludar al doctor en su panel, siempre con su título (CLI-267: el
 * saludo es formal): "Dra." si su nombre público lo dice ("Dra. María"),
 * "Dr." en cualquier otro caso ("Dr. Paul"). Sin nombre, "Doctor".
 */
export function doctorGreetingName(displayName: string | null | undefined): string {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  // "Dr./Dra." es la sugerencia del alta que quedó sin elegir: va "Dr.".
  if (UNDECIDED_TITLE.test(words[0] ?? '')) {
    words.shift();
    return words[0] ? `Dr. ${words[0]}` : 'Doctor';
  }
  if (words.length === 0) {
    return 'Doctor';
  }
  if (TITLE.test(words[0])) {
    return words.length > 1 ? `${normalizeTitle(words[0])} ${words[1]}` : 'Doctor';
  }
  return `Dr. ${words[0]}`;
}
