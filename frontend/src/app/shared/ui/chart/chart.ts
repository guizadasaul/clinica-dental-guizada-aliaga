import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  ElementRef,
  InjectionToken,
  afterNextRender,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

// Solo lo que usan los reportes: mantiene chico el bundle (CLI-199).
echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

/** Lo mínimo que el wrapper usa de una instancia de ECharts. */
export interface ChartInstance {
  setOption(option: EChartsCoreOption, notMerge: boolean): void;
  resize(): void;
  dispose(): void;
}

/**
 * Crea la instancia sobre el elemento. Es un token para que los tests la
 * reemplacen sin mockear el módulo de echarts (vi.mock no es confiable con
 * el bundling del builder de tests de Angular).
 */
export const CHART_FACTORY = new InjectionToken<(element: HTMLElement) => ChartInstance>('CHART_FACTORY', {
  providedIn: 'root',
  factory: () => (element) => echarts.init(element, null, { renderer: 'svg' }),
});

/**
 * Wrapper mínimo de Apache ECharts: recibe la opción ya armada, la vuelve a
 * aplicar cuando cambia y se redimensiona con su contenedor.
 */
@Component({
  selector: 'app-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div #host class="chart" [style.height.px]="height()"></div>',
  styles: ':host { display: block; } .chart { width: 100%; }',
})
export class ChartComponent {
  readonly option = input.required<EChartsCoreOption>();
  readonly height = input(280);

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly createChart = inject(CHART_FACTORY);
  private chart: ChartInstance | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const element = this.host().nativeElement;
      this.chart = this.createChart(element);
      this.chart.setOption(this.option(), true);

      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.chart?.resize());
      observer?.observe(element);

      destroyRef.onDestroy(() => {
        observer?.disconnect();
        this.chart?.dispose();
        this.chart = null;
      });
    });

    effect(() => {
      const option = this.option();
      // Antes del primer render todavía no hay instancia: afterNextRender aplica la opción.
      this.chart?.setOption(option, true);
    });
  }
}
