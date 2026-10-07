import { TestBed } from '@angular/core/testing';
import { KpiCardComponent } from './kpi-card';

function setup(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ imports: [KpiCardComponent] });
  const fixture = TestBed.createComponent(KpiCardComponent);
  fixture.componentRef.setInput('label', 'Citas');
  fixture.componentRef.setInput('value', '12');
  fixture.componentRef.setInput('icon', 'event');
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('KpiCardComponent', () => {
  it('muestra el nombre y el valor', () => {
    const root = setup({});
    expect(root.textContent).toContain('Citas');
    expect(root.querySelector('.kpi-card__value')!.textContent).toBe('12');
    expect(root.querySelector('.kpi-card__delta')).toBeNull();
    expect(root.textContent).toContain('Sin datos del período anterior');
  });

  it('una subida se muestra con signo y en verde', () => {
    const delta = setup({ delta: 25 }).querySelector('.kpi-card__delta')!;
    expect(delta.textContent).toContain('+25%');
    expect(delta.textContent).toContain('trending_up');
    expect(delta.classList).toContain('kpi-card__delta--good');
  });

  it('una bajada se muestra en rojo, salvo que bajar sea lo bueno', () => {
    expect(setup({ delta: -10 }).querySelector('.kpi-card__delta--bad')).not.toBeNull();
    TestBed.resetTestingModule();
    const delta = setup({ delta: -10, lowerIsBetter: true }).querySelector('.kpi-card__delta')!;
    expect(delta.textContent).toContain('-10%');
    expect(delta.classList).toContain('kpi-card__delta--good');
  });

  it('sin cambio no se colorea', () => {
    const delta = setup({ delta: 0 }).querySelector('.kpi-card__delta')!;
    expect(delta.textContent).toContain('0%');
    expect(delta.textContent).toContain('trending_flat');
    expect(delta.className).not.toMatch(/--good|--bad/);
  });

  it('sin variación muestra el texto de ayuda', () => {
    expect(setup({ hint: 'Saldo actual por cobrar' }).textContent).toContain('Saldo actual por cobrar');
  });
});
