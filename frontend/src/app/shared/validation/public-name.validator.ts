// Nombre público de un doctor (CLI-254): el alta lo sugiere como
// "Dr./Dra. Nombre Apellido" para que el admin elija. Si se guarda sin elegir,
// los pacientes ven "Dr./Dra." al reservar y el saludo del panel no sabe qué
// título usar. Mismo criterio que NO_UNDECIDED_TITLE en el backend.
const UNDECIDED_TITLE = /\bdr\.?\s*\/\s*dra\.?/i;

/** Error si el nombre todavía dice "Dr./Dra." en vez de uno de los dos. */
export function undecidedTitleError(value: string): string | null {
  return UNDECIDED_TITLE.test(value) ? 'Elige "Dr." o "Dra." para el nombre público.' : null;
}
