import { downloadCsv, toCsv } from './csv';

interface Row {
  name: string;
  amount: number;
  note: string | null;
}

const COLUMNS = [
  { header: 'Doctor', value: (r: Row) => r.name },
  { header: 'Cobrado (Bs.)', value: (r: Row) => r.amount },
  { header: 'Nota', value: (r: Row) => r.note },
];

describe('toCsv', () => {
  it('separa con ";" y usa coma decimal, como espera Excel en español', () => {
    expect(toCsv([{ name: 'Dr. Juan Perez', amount: 1500.5, note: null }], COLUMNS)).toBe(
      'Doctor;Cobrado (Bs.);Nota\r\nDr. Juan Perez;1500,5;',
    );
  });

  it('entrecomilla los valores con separador, comillas o saltos de línea', () => {
    const csv = toCsv([{ name: 'Ana; "Anita"', amount: 0, note: 'línea 1\nlínea 2' }], COLUMNS);
    expect(csv.split('\r\n')[1]).toBe('"Ana; ""Anita""";0;"línea 1\nlínea 2"');
  });

  it('sin filas deja solo los encabezados', () => {
    expect(toCsv([], COLUMNS)).toBe('Doctor;Cobrado (Bs.);Nota');
  });
});

describe('downloadCsv', () => {
  it('descarga un archivo con BOM UTF-8 y el nombre pedido', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:csv');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadCsv('reporte.csv', 'a;b');

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(click).toHaveBeenCalled();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('reporte.csv');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv');

    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
