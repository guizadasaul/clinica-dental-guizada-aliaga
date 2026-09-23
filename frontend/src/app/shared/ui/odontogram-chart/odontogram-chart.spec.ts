import { TestBed } from '@angular/core/testing';
import { OdontogramChartComponent } from './odontogram-chart';

function setup() {
  TestBed.configureTestingModule({ imports: [OdontogramChartComponent] });
  return TestBed.createComponent(OdontogramChartComponent);
}

function cell(fixture: ReturnType<typeof setup>, toothNumber: number): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    `.odontogram-chart__cell[aria-label="Diente ${toothNumber}"]`,
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
