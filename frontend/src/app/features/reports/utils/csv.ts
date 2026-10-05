/** Una columna del CSV: encabezado y cómo sacar el valor de cada fila. */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null;
}

// Excel en español usa ";" como separador de listas: con "," cada fila queda en una sola columna.
const SEPARATOR = ';';

function escapeCell(value: string | number | null): string {
  if (value === null) {
    return '';
  }
  const text = typeof value === 'number' ? String(value).replace('.', ',') : value;
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [
    columns.map((c) => escapeCell(c.header)).join(SEPARATOR),
    ...rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(SEPARATOR)),
  ];
  return lines.join('\r\n');
}

/** Descarga el CSV con BOM UTF-8 para que Excel muestre bien los acentos. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
