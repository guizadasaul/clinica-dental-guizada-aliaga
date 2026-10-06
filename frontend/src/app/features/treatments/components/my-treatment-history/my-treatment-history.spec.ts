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

  it('muestra cada tratamiento con fecha, dientes, superficies, indicaciones y doctor', () => {
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
    const cards = root.querySelectorAll('.treatment');

    // Las dos filas del mismo grupo son una sola aplicación.
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card.querySelector('.treatment__name')?.textContent).toBe('Restauración con resina');
    expect(card.querySelector('.treatment__date')?.textContent).toContain('16 de septiembre de 2026');
    expect([...card.querySelectorAll('.treatment__tooth')].map((t) => t.textContent?.trim())).toEqual([
      'Pieza 16',
      'Pieza 17',
    ]);
    expect(card.textContent).toContain('Superficies: Oclusal, Mesial');
    expect(card.querySelector('.treatment__note')?.textContent).toContain('Evita alimentos muy duros');
    expect(card.textContent).toContain('Realizado por Dra. Lucía Mamani');
    expect(root.querySelector('.summary__value')?.textContent).toBe('1');
    expect(root.querySelector('.summary__label')?.textContent).toBe('tratamiento recibido');
  });

  it('los de boca completa o por unidades muestran su alcance en vez de dientes', () => {
    const { root } = setup(
      of([
        proc({ id: 'a', toothNumber: null, applicationType: 'full_mouth', treatmentName: 'Limpieza dental' }),
        proc({ id: 'b', toothNumber: null, applicationType: 'unit', quantity: 3, procedureDate: '2026-09-01T00:00:00.000Z' }),
        proc({ id: 'c', toothNumber: null, applicationType: 'general', procedureDate: '2026-08-01T00:00:00.000Z', performedByName: null }),
      ]),
    );
    const cards = root.querySelectorAll('.treatment');

    expect(cards[0].textContent).toContain('Boca completa');
    expect(cards[1].textContent).toContain('3 unidades');
    expect(cards[2].querySelector('.treatment__teeth')).toBeNull();
    expect(cards[2].querySelector('.treatment__doctor')).toBeNull();
  });

  it('agrupa por mes, del más reciente al más antiguo, y filtra por tipo', () => {
    const { fixture, root } = setup(
      of([
        proc({ id: 'old', procedureDate: '2026-08-10T00:00:00.000Z', categoryName: 'Endodoncia', categoryColor: '#a21caf' }),
        proc({ id: 'new', procedureDate: '2026-09-16T00:00:00.000Z' }),
      ]),
    );

    expect([...root.querySelectorAll('.month__label')].map((m) => m.textContent)).toEqual([
      'Septiembre de 2026',
      'Agosto de 2026',
    ]);
    expect(root.querySelector('.summary')?.textContent).toContain('16 de septiembre de 2026');

    const chips = [...root.querySelectorAll<HTMLButtonElement>('.filters__chip')];
    expect(chips.map((c) => c.textContent?.trim())).toEqual(['Todos', 'Restauraciones', 'Endodoncia']);
    chips[2].click();
    fixture.detectChanges();

    expect(root.querySelectorAll('.treatment')).toHaveLength(1);
    expect(root.querySelector('.treatment__category')?.textContent).toContain('Endodoncia');
    expect(chips[2].getAttribute('aria-pressed')).toBe('true');

    chips[0].click();
    fixture.detectChanges();
    expect(root.querySelectorAll('.treatment')).toHaveLength(2);
  });

  it('con una sola categoría no muestra filtros', () => {
    expect(setup(of([proc()])).root.querySelector('.filters')).toBeNull();
  });
});
