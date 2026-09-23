/**
 * Paleta de colores de doctor (CLI-110) — distingue de quién es cada turno en
 * la agenda común. Colores bien separados entre sí y legibles como borde y
 * como fondo suave con texto oscuro encima. El orden es el de asignación.
 */
export const DOCTOR_COLOR_PALETTE = [
  '#2563eb',
  '#db2777',
  '#16a34a',
  '#ea580c',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
  '#dc2626',
] as const;

/** Formato de color aceptado al editar un doctor ("#rrggbb"). */
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * El primer color de la paleta que ningún otro doctor usa; si ya están todos
 * tomados, rota según cuántos hay (no bloquea el alta).
 */
export function nextDoctorColor(usedColors: readonly string[]): string {
  const used = new Set(usedColors.map((c) => c.toLowerCase()));
  const free = DOCTOR_COLOR_PALETTE.find((c) => !used.has(c));
  return (
    free ??
    DOCTOR_COLOR_PALETTE[usedColors.length % DOCTOR_COLOR_PALETTE.length]
  );
}
