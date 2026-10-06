import { TestBed } from '@angular/core/testing';
import { NEVER, of, throwError, type Observable } from 'rxjs';
import { MyTreatmentHistoryComponent } from './my-treatment-history';
import { TreatmentsService } from '../../services/treatments.service';
import type { ToothProcedure } from '../../models/treatment.model';

function proc(overrides: Partial<ToothProcedure> = {}): ToothProcedure {
  return {
    id: 'p-1',
    patientId: 'patient-1',
    toothNumber: 16,
    applicationGroupId: null,
    treatmentId: 't-1',
    treatmentName: 'Restauración con resina',
    applicationType: 'single_tooth',
    categoryCode: 'restauraciones',
    categoryName: 'Restauraciones',
    categoryColor: '#e89858',
    priceCharged: 350,
    quantity: 1,
    procedureDate: '2026-09-16T00:00:00.000Z',
    surfaces: [],
    notes: null,
    performedBy: 'doctor-1',
    performedByName: 'Dra. Lucía Mamani',
    createdAt: '2026-09-16T15:00:00.000Z',
    ...overrides,
  };
}

function setup(procedures$: Observable<ToothProcedure[]>) {
  TestBed.configureTestingModule({
    imports: [MyTreatmentHistoryComponent],
    providers: [{ provide: TreatmentsService, useValue: { getMyToothProcedures: () => procedures$ } }],
  });
  const fixture = TestBed.createComponent(MyTreatmentHistoryComponent);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('MyTreatmentHistoryComponent (CLI-211)', () => {
  it('mientras carga lo dice', () => {
    expect(setup(NEVER).root.textContent).toContain('Cargando tu historial...');
  });

  it('si falla lo dice', () => {
    expect(setup(throwError(() => new Error('500'))).root.textContent).toContain(
      'No pudimos cargar tu historial',
    );
  });

  it('sin tratamientos muestra el estado vacío, con textos para el paciente', () => {
    const text = setup(of([])).root.textContent ?? '';

    expect(text).toContain('Todavía no tienes tratamientos registrados');
    expect(text).not.toContain('Este paciente');
  });

  it('muestra cada tratamiento con fecha, piezas, superficies, doctor e indicaciones en una fila', () => {
    const { root } = setup(
      of([
        proc({
          id: 'a',
          applicationGroupId: 'g-1',
          toothNumber: 17,
          surfaces: ['occlusal', 'mesial'],
          notes: 'Evita alimentos muy duros por 24 horas.',
        }),
        proc({ id: 'b', applicationGroupId: 'g-1', toothNumber: 16, surfaces: ['occlusal'] }),
      ]),
    );
    const rows = root.querySelectorAll('.treatment');

    // Las dos filas del mismo grupo son una sola aplicación.
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.treatment__date')?.textContent).toBe('16 de septiembre de 2026');
    expect(rows[0].querySelector('.treatment__name')?.textContent).toBe('Restauración con resina');
    expect(rows[0].querySelector('.treatment__meta')?.textContent).toBe(
      'Piezas 16, 17 · Oclusal, Mesial · Dra. Lucía Mamani',
    );
    expect(rows[0].querySelector('.treatment__notes')?.textContent).toContain('Evita alimentos muy duros');
  });

  it('los de boca completa o por unidades muestran su alcance en vez de piezas', () => {
    const { root } = setup(
      of([
        proc({ id: 'a', toothNumber: null, applicationType: 'full_mouth', treatmentName: 'Limpieza dental' }),
        proc({ id: 'b', toothNumber: null, applicationType: 'unit', quantity: 3, procedureDate: '2026-09-01T00:00:00.000Z' }),
        proc({ id: 'c', toothNumber: null, applicationType: 'general', procedureDate: '2026-08-01T00:00:00.000Z', performedByName: null }),
      ]),
    );
    const rows = root.querySelectorAll('.treatment');

    expect(rows[0].querySelector('.treatment__meta')?.textContent).toBe('Boca completa · Dra. Lucía Mamani');
    expect(rows[1].querySelector('.treatment__meta')?.textContent).toBe('3 unidades · Dra. Lucía Mamani');
    expect(rows[2].querySelector('.treatment__meta')).toBeNull();
  });

  it('ordena del más reciente al más antiguo y filtra por tipo con un select', () => {
    const { fixture, root } = setup(
      of([
        proc({ id: 'old', procedureDate: '2026-08-10T00:00:00.000Z', categoryName: 'Endodoncia', treatmentName: 'Endodoncia molar' }),
        proc({ id: 'new', procedureDate: '2026-09-16T00:00:00.000Z' }),
      ]),
    );
    const names = () => [...root.querySelectorAll('.treatment__name')].map((n) => n.textContent);

    expect(names()).toEqual(['Restauración con resina', 'Endodoncia molar']);
    const select = root.querySelector<HTMLSelectElement>('.history__select')!;
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual([
      'Todos los tratamientos',
      'Restauraciones',
      'Endodoncia',
    ]);
    select.value = 'Endodoncia';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(names()).toEqual(['Endodoncia molar']);

    select.value = '';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(names()).toHaveLength(2);
  });

  it('con un solo tipo no muestra el filtro', () => {
    expect(setup(of([proc()])).root.querySelector('.history__select')).toBeNull();
  });

  it('muestra de a 10 tratamientos y pagina el resto; filtrar vuelve a la primera página', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      proc({
        id: `p-${i}`,
        procedureDate: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        categoryName: i === 0 ? 'Endodoncia' : 'Restauraciones',
      }),
    );
    const { fixture, root } = setup(of(many));
    const rows = () => root.querySelectorAll('.treatment');

    expect(rows()).toHaveLength(10);
    const next = [...root.querySelectorAll<HTMLButtonElement>('app-pagination button')].at(-1)!;
    next.click();
    fixture.detectChanges();
    expect(rows()).toHaveLength(2);

    const select = root.querySelector<HTMLSelectElement>('.history__select')!;
    select.value = 'Restauraciones';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(rows()).toHaveLength(10);
  });
});
