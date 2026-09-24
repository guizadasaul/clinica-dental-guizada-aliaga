import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TreatmentHistoryComponent } from './treatment-history';
import { TreatmentsService } from '../../services/treatments.service';
import type { ToothProcedure, Treatment } from '../../models/treatment.model';

function procedure(overrides: Partial<ToothProcedure> = {}): ToothProcedure {
  return {
    id: 'proc-1',
    patientId: 'patient-1',
    toothNumber: 16,
    applicationGroupId: null,
    treatmentId: 'resina',
    applicationType: 'single_tooth',
    categoryCode: 'rest',
    categoryName: 'Restauración',
    categoryColor: '#1d4ed8',
    priceCharged: 150,
    quantity: 1,
    procedureDate: '2026-09-20T10:00:00.000Z',
    surfaces: [],
    notes: null,
    performedBy: 'doctor-1',
    createdAt: '2026-09-20T10:00:00.000Z',
    ...overrides,
  };
}

const TREATMENTS = [
  { id: 'resina', name: 'Resina', currency: 'BOB', basePriceBob: null },
  { id: 'carilla', name: 'Carilla', currency: 'USD', basePriceBob: 1392 },
] as Treatment[];

function setup(procedures: ToothProcedure[] | Error) {
  TestBed.configureTestingModule({
    imports: [TreatmentHistoryComponent],
    providers: [
      {
        provide: TreatmentsService,
        useValue: {
          getAll: () => of(TREATMENTS),
          getToothProcedures: vi.fn(() => (procedures instanceof Error ? throwError(() => procedures) : of(procedures))),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(TreatmentHistoryComponent);
  fixture.componentRef.setInput('patientId', 'patient-1');
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const rows = () => [...root.querySelectorAll('.th__table tbody tr')].map((r) => r.textContent ?? '');
  return { fixture, root, rows };
}

describe('TreatmentHistoryComponent', () => {
  it('sin tratamientos lo avisa', () => {
    expect(setup([]).root.textContent).toContain('Este paciente no tiene tratamientos registrados');
  });

  it('si no carga, muestra el error', () => {
    expect(setup(new Error('500')).root.textContent).toContain('No se pudo cargar el historial');
  });

  it('muestra cada tratamiento con fecha, pieza, superficies, precio y notas, y el total cobrado', () => {
    const { root, rows } = setup([
      procedure({ surfaces: ['occlusal', 'mesial'], notes: 'Control en 6 meses' }),
      procedure({ id: 'proc-2', toothNumber: null, treatmentId: 'carilla', priceCharged: 700 }),
    ]);

    expect(root.textContent).toContain('2 tratamientos');
    expect(root.textContent).toContain('Bs. 850.00');
    expect(rows()[0]).toContain('20/09/2026');
    expect(rows()[0]).toContain('#16');
    expect(rows()[0]).toContain('Resina');
    expect(rows()[0]).toContain('Ocl., Mes.');
    expect(rows()[0]).toContain('Control en 6 meses');
    expect(rows()[1]).toContain('Carilla');
    expect(rows()[1]).toContain('$ 700.00');
    expect(rows()[1]).toContain('aprox. Bs 1,392.00');
  });

  it('agrupa las filas de una misma aplicación en varias piezas, sumando su precio', () => {
    const { root, rows } = setup([
      procedure({ id: 'a', toothNumber: 16, applicationGroupId: 'g1', priceCharged: 300, surfaces: ['occlusal'] }),
      procedure({ id: 'b', toothNumber: 17, applicationGroupId: 'g1', priceCharged: 0 }),
    ]);

    expect(root.textContent).toContain('1 tratamiento');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toContain('#16');
    expect(rows()[0]).toContain('#17');
    expect(rows()[0]).toContain('300.00');
  });

  it('un tratamiento que ya no existe en el catálogo se muestra con guion', () => {
    const { rows } = setup([procedure({ treatmentId: 'borrado' })]);

    expect(rows()[0]).toContain('—');
    expect(rows()[0]).toContain('Bs.');
  });

  it('volver cierra el historial', () => {
    const { fixture, root } = setup([]);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);

    root.querySelector<HTMLButtonElement>('app-page-header button')!.click();

    expect(closed).toBe(1);
  });
});
