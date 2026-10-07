import { TestBed } from '@angular/core/testing';
import { CHART_FACTORY, ChartComponent } from './chart';

describe('ChartComponent', () => {
  function setup(option: Record<string, unknown>) {
    const instance = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
    const factory = vi.fn(() => instance);
    TestBed.configureTestingModule({
      imports: [ChartComponent],
      providers: [{ provide: CHART_FACTORY, useValue: factory }],
    });
    const fixture = TestBed.createComponent(ChartComponent);
    fixture.componentRef.setInput('option', option);
    fixture.componentRef.setInput('height', 320);
    fixture.detectChanges();
    // afterNextRender corre en el tick de la app, no en detectChanges del fixture.
    TestBed.tick();
    return { fixture, instance, factory };
  }

  it('crea el gráfico sobre su contenedor con la opción y la altura pedidas', () => {
    const { fixture, instance, factory } = setup({ series: [] });

    const host = (fixture.nativeElement as HTMLElement).querySelector<HTMLDivElement>('.chart')!;
    expect(host.style.height).toBe('320px');
    expect(factory).toHaveBeenCalledWith(host);
    expect(instance.setOption).toHaveBeenCalledWith({ series: [] }, true);
  });

  it('vuelve a aplicar la opción cuando cambia', () => {
    const { fixture, instance } = setup({ series: [] });
    instance.setOption.mockClear();

    fixture.componentRef.setInput('option', { series: [{ type: 'bar' }] });
    TestBed.tick();

    expect(instance.setOption).toHaveBeenCalledWith({ series: [{ type: 'bar' }] }, true);
  });

  it('libera el gráfico al destruirse', () => {
    const { fixture, instance } = setup({ series: [] });
    fixture.destroy();
    expect(instance.dispose).toHaveBeenCalled();
  });
});
