import { TestBed } from '@angular/core/testing';
import { OdontogramChartComponent } from './odontogram-chart';

function setup() {
  TestBed.configureTestingModule({ imports: [OdontogramChartComponent] });
  return TestBed.createComponent(OdontogramChartComponent);
}

function cell(fixture: ReturnType<typeof setup>, toothNumber: number): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    `.odontogram-chart__cell[data-tooth="${toothNumber}"]`,
  ) as HTMLElement;
}

function paint(fixture: ReturnType<typeof setup>, toothNumber: number): Element {
  return cell(fixture, toothNumber).querySelector('.odontogram-chart__cell-paint') as Element;
}

function fill(fixture: ReturnType<typeof setup>, toothNumber: number): string | null {
  return cell(fixture, toothNumber).querySelector('.odontogram-chart__cell-shape')?.getAttribute('fill') ?? null;
}

describe('OdontogramChartComponent', () => {
  it('pinta el diente marcado con su color y la clase --diagnosed', () => {
    const fixture = setup();
    fixture.componentRef.setInput('toothColor', new Map([[16, '#dc2626']]));
    fixture.detectChanges();

    expect(fill(fixture, 16)).toBe('#dc2626');
    expect(paint(fixture, 16).classList).toContain('odontogram-chart__cell-paint--diagnosed');
    expect(paint(fixture, 16).classList).not.toContain('odontogram-chart__cell-paint--selected');
    expect(fill(fixture, 17)).toBe('transparent');
  });

  it('un diente marcado y seleccionado conserva su color y suma la clase --selected', () => {
    const fixture = setup();
    fixture.componentRef.setInput('toothColor', new Map([[16, '#dc2626']]));
    fixture.componentRef.setInput('selectedTeeth', [16]);
    fixture.detectChanges();

    expect(fill(fixture, 16)).toBe('#dc2626');
    expect(paint(fixture, 16).classList).toContain('odontogram-chart__cell-paint--diagnosed');
    expect(paint(fixture, 16).classList).toContain('odontogram-chart__cell-paint--selected');
  });

  it('un diente sano seleccionado se pinta navy', () => {
    const fixture = setup();
    fixture.componentRef.setInput('selectedTeeth', [21]);
    fixture.detectChanges();

    expect(fill(fixture, 21)).toBe('#1a2b5e');
    expect(paint(fixture, 21).classList).toContain('odontogram-chart__cell-paint--selected');
    expect(paint(fixture, 21).classList).not.toContain('odontogram-chart__cell-paint--diagnosed');
  });

  it('emite el número del diente al hacer clic', () => {
    const fixture = setup();
    fixture.detectChanges();
    const clicked: number[] = [];
    fixture.componentInstance.toothClick.subscribe((n) => clicked.push(n));

    cell(fixture, 36).dispatchEvent(new Event('click'));

    expect(clicked).toEqual([36]);
  });

  it('con más de un diagnóstico en un diente muestra "+N" y los lista en la etiqueta (CLI-179)', () => {
    const fixture = setup();
    fixture.componentRef.setInput('toothColor', new Map([[16, '#dc2626']]));
    fixture.componentRef.setInput('toothNames', new Map([[16, ['Caries', 'Periodontitis', 'Fractura']], [36, ['Caries']]]));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const cell16 = root.querySelector('.odontogram-chart__cell[data-tooth="16"]')!;
    const cell36 = root.querySelector('.odontogram-chart__cell[data-tooth="36"]')!;

    expect(cell16.querySelector('.odontogram-chart__cell-badge')?.textContent?.trim()).toBe('+2');
    expect(cell16.getAttribute('aria-label')).toBe('Diente 16: Caries, Periodontitis, Fractura');
    expect(cell16.querySelector('title')?.textContent).toBe('Diente 16: Caries, Periodontitis, Fractura');
    // Un solo diagnóstico: sin indicador.
    expect(cell36.querySelector('.odontogram-chart__cell-badge')).toBeNull();
    expect(root.querySelector('.odontogram-chart__cell[data-tooth="21"]')?.getAttribute('aria-label')).toBe('Diente 21');
  });

  it('muestra la leyenda solo cuando hay ítems', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.odontogram-chart__legend')).toBeFalsy();

    fixture.componentRef.setInput('legendItems', [{ name: 'Caries dentales', color: '#dc2626' }]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.odontogram-chart__legend')?.textContent)
      .toContain('Caries dentales');
  });

  it('con interactive=false no es clickeable ni enfocable', () => {
    const fixture = setup();
    fixture.componentRef.setInput('interactive', false);
    fixture.detectChanges();
    const clicked: number[] = [];
    fixture.componentInstance.toothClick.subscribe((n) => clicked.push(n));

    const c = cell(fixture, 16);
    c.dispatchEvent(new Event('click'));

    expect(clicked).toEqual([]);
    expect(c.getAttribute('role')).toBeNull();
    expect(c.getAttribute('tabindex')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.odontogram-chart--readonly')).toBeTruthy();
  });
});
