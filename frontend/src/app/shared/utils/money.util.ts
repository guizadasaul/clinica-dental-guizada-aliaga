const BS_FORMATTER = new Intl.NumberFormat('es-BO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Monto en bolivianos tal como lo ve el paciente: "Bs. 1.250,00". */
export function formatBs(value: number): string {
  return `Bs. ${BS_FORMATTER.format(value)}`;
}
