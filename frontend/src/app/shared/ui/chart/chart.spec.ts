import { TestBed } from '@angular/core/testing';
import { ChartComponent } from './chart';

const instance = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: vi.fn(() => instance),
}));

describe('ChartComponent', () => {
  beforeEach(() => vi.clearAllMocks());

  async function setup(option: Record<string, unknown>) {
    TestBed.configureTestingModule({ imports: [ChartComponent] });
    const fixture = TestBed.createComponent(ChartComponent);
    fixture.componentRef.setInput('option', option);
    fixture.componentRef.setInput('height', 320);
    fixture.detectChanges();
    // afterNextRender corre en el tick de la app, no en detectChanges del fixture.
    TestBed.tick();
    await fixture.whenStable();
    return fixture;
  }

  it('inicializa ECharts en SVG con la opción y la altura pedidas', async () => {
    const echarts = await import('echarts/core');
    const fixture = await setup({ series: [] });

    const host = (fixture.nativeElement as HTMLElement).querySelector<HTMLDivElement>('.chart')!;
    expect(host.style.height).toBe('320px');
    expect(echarts.init).toHaveBeenCalledWith(host, null, { renderer: 'svg' });
    expect(instance.setOption).toHaveBeenCalledWith({ series: [] }, true);
  });

  it('vuelve a aplicar la opción cuando cambia', async () => {
    const fixture = await setup({ series: [] });
    instance.setOption.mockClear();

    fixture.componentRef.setInput('option', { series: [{ type: 'bar' }] });
    TestBed.tick();
    await fixture.whenStable();

    expect(instance.setOption).toHaveBeenCalledWith({ series: [{ type: 'bar' }] }, true);
  });

  it('libera el gráfico al destruirse', async () => {
    const fixture = await setup({ series: [] });
    fixture.destroy();
    expect(instance.dispose).toHaveBeenCalled();
  });
});
