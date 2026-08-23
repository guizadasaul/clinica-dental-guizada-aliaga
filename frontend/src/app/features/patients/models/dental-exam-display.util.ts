// Compartido entre step-odontogram (panel editable) y clinical-record-view
// (resumen de solo lectura, CLI-40) — mismos códigos de modifier_value en
// los dos lugares donde se muestran.
export const MODIFIER_LABELS: Record<string, string> = {
  clase_i: 'Clase I',
  clase_ii: 'Clase II',
  clase_iii: 'Clase III',
  clase_iv: 'Clase IV',
  clase_v: 'Clase V',
  grado_i: 'Grado I',
  grado_ii: 'Grado II',
  grado_iii: 'Grado III',
  grado_iv: 'Grado IV',
};

export function modifierLabel(value: string): string {
  return MODIFIER_LABELS[value] ?? value;
}
