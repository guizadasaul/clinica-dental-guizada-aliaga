import { TestBed } from '@angular/core/testing';
import { ScheduleEditorComponent } from './schedule-editor';

function setup(blocks: { weekday: number; start: string; end: string }[] = []) {
  TestBed.configureTestingModule({ imports: [ScheduleEditorComponent] });
  const fixture = TestBed.createComponent(ScheduleEditorComponent);
  fixture.componentRef.setInput('blocks', blocks);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const rows = () => root.querySelectorAll('.schedule__row');
  const change = (el: Element, value: string) => {
    (el as HTMLInputElement).value = value;
    el.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  return { fixture, root, rows, change };
}

describe('ScheduleEditorComponent (CLI-191)', () => {
  it('sin bloques dice que no se ofrecen citas', () => {
    const { root, rows } = setup();

    expect(rows()).toHaveLength(0);
    expect(root.textContent).toContain('no se ofrecen citas');
  });

  it('"Agregar bloque" suma una fila y "Quitar" la saca', () => {
    const { fixture, root, rows } = setup();

    root.querySelector<HTMLButtonElement>('.schedule__add')!.click();
    fixture.detectChanges();
    expect(rows()).toHaveLength(1);
    expect(fixture.componentInstance.blocks()).toEqual([{ weekday: 1, start: '09:00', end: '12:00' }]);

    root.querySelector<HTMLButtonElement>('.schedule__remove')!.click();
    fixture.detectChanges();
    expect(rows()).toHaveLength(0);
  });

  it('editar día, desde y hasta actualiza solo ese bloque', () => {
    const { fixture, root, change } = setup([
      { weekday: 1, start: '08:00', end: '12:00' },
      { weekday: 2, start: '08:00', end: '12:00' },
    ]);
    const second = root.querySelectorAll('.schedule__row')[1];

    change(second.querySelector('select')!, '4');
    const [start, end] = [...second.querySelectorAll('input[type="time"]')];
    change(start, '09:30');
    change(end, '13:15');

    expect(fixture.componentInstance.blocks()).toEqual([
      { weekday: 1, start: '08:00', end: '12:00' },
      { weekday: 4, start: '09:30', end: '13:15' },
    ]);
  });

  it('muestra el error cuando el inicio no es anterior al fin o hay solape', () => {
    const { root } = setup([{ weekday: 1, start: '18:00', end: '09:00' }]);
    expect(root.querySelector('.schedule__error')?.textContent).toContain('inicio');

    TestBed.resetTestingModule();
    const overlapped = setup([
      { weekday: 1, start: '08:00', end: '12:00' },
      { weekday: 1, start: '11:00', end: '15:00' },
    ]);
    expect(overlapped.root.querySelector('.schedule__error')?.textContent).toContain('solapan');
  });

  it('un horario válido no muestra ningún error', () => {
    const { root } = setup([{ weekday: 1, start: '08:00', end: '12:00' }]);

    expect(root.querySelector('.schedule__error')).toBeNull();
  });
});
