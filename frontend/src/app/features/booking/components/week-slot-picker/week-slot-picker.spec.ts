import { TestBed } from '@angular/core/testing';
import { WeekSlotPickerComponent } from './week-slot-picker';

const EMPTY_TITLE = 'Sin citas disponibles por ahora';

function range(slotsForFirstDay: string[] = []): Record<string, string[]> {
  const slotsByDate: Record<string, string[]> = {};
  for (let i = 0; i < 14; i++) {
    const date = new Date(Date.UTC(2026, 9, 5 + i)).toISOString().slice(0, 10);
    slotsByDate[date] = i === 0 ? slotsForFirstDay : [];
  }
  return slotsByDate;
}

function setup(inputs: {
  slotsByDate: Record<string, string[]>;
  loading?: boolean;
  error?: string | null;
  doctorName?: string | null;
}) {
  TestBed.configureTestingModule({ imports: [WeekSlotPickerComponent] });
  const fixture = TestBed.createComponent(WeekSlotPickerComponent);
  fixture.componentRef.setInput('slotsByDate', inputs.slotsByDate);
  fixture.componentRef.setInput('loading', inputs.loading ?? false);
  fixture.componentRef.setInput('error', inputs.error ?? null);
  fixture.componentRef.setInput('doctorName', inputs.doctorName ?? null);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('WeekSlotPickerComponent', () => {
  it('con horarios muestra los días y los turnos del día activo', () => {
    const { root } = setup({ slotsByDate: range(['2026-10-05T13:00:00.000Z']) });

    expect(root.textContent).not.toContain(EMPTY_TITLE);
    expect(root.querySelectorAll('.week-picker__day')).toHaveLength(7);
    expect(root.querySelectorAll('.week-picker__slot')).toHaveLength(1);
  });

  it('sin ningún horario en el rango explica por qué en vez de mostrar días vacíos (CLI-142)', () => {
    const { root } = setup({ slotsByDate: range() });

    expect(root.textContent).toContain(EMPTY_TITLE);
    expect(root.querySelector('.week-picker__days')).toBeNull();
    expect(root.querySelector('.week-picker__empty a')?.getAttribute('href')).toContain('wa.me');
  });

  it('"Elegir otro doctor" avisa al padre', () => {
    const { fixture, root } = setup({ slotsByDate: range() });
    const emitted: unknown[] = [];
    fixture.componentInstance.changeDoctor.subscribe(() => emitted.push(true));

    (root.querySelector('.week-picker__empty-btn') as HTMLButtonElement).click();

    expect(emitted).toHaveLength(1);
  });

  it('mientras carga o con error no muestra el estado sin turnos', () => {
    expect(setup({ slotsByDate: range(), loading: true }).root.textContent).not.toContain(EMPTY_TITLE);
    TestBed.resetTestingModule();
    const { root } = setup({ slotsByDate: range(), error: 'No pudimos cargar los horarios' });
    expect(root.textContent).not.toContain(EMPTY_TITLE);
    expect(root.textContent).toContain('No pudimos cargar los horarios');
  });

  it('con turnos muestra con quién se reserva y deja cambiar de doctor (CLI-164)', () => {
    const { fixture, root } = setup({ slotsByDate: range(['2026-10-05T13:00:00.000Z']), doctorName: 'Dra. Ejemplo' });
    const emitted: unknown[] = [];
    fixture.componentInstance.changeDoctor.subscribe(() => emitted.push(true));

    expect(root.querySelector('.week-picker__doctor-label')?.textContent).toContain('Dra. Ejemplo');
    (root.querySelector('.week-picker__change-doctor') as HTMLButtonElement).click();

    expect(emitted).toHaveLength(1);
  });

  it('mientras carga también se puede cambiar de doctor, aunque no se sepa el nombre', () => {
    const { root } = setup({ slotsByDate: {}, loading: true });

    expect(root.querySelector('.week-picker__doctor-label')?.textContent).toContain('Elige un horario');
    expect(root.querySelector('.week-picker__change-doctor')).not.toBeNull();
  });

  it('antes de recibir datos tampoco lo muestra', () => {
    expect(setup({ slotsByDate: {} }).root.textContent).not.toContain(EMPTY_TITLE);
  });
});
