import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';

type DeltaTrend = 'up' | 'down' | 'flat';

/**
 * Tarjeta de un indicador con su variación contra el período anterior.
 * Presentacional: el valor llega ya formateado (Bs., %, conteo).
 */
@Component({
  selector: 'app-kpi-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kpi-card.html',
  styleUrl: './kpi-card.scss',
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly icon = input.required<string>();
  /** Variación porcentual; null = sin comparación (no se muestra o no hay base). */
  readonly delta = input<number | null>(null);
  /** true cuando que el número baje es lo bueno (ej. canceladas). */
  readonly lowerIsBetter = input(false);
  /** Texto bajo el valor cuando no hay variación que mostrar (por defecto, que no hay con qué comparar). */
  readonly hint = input<string | null>(null);

  protected readonly trend = computed<DeltaTrend | null>(() => {
    const delta = this.delta();
    if (delta === null) {
      return null;
    }
    if (delta === 0) {
      return 'flat';
    }
    return delta > 0 ? 'up' : 'down';
  });

  /** Verde si el cambio va en la dirección buena, rojo si no. */
  protected readonly positive = computed(() => {
    const trend = this.trend();
    if (trend === null || trend === 'flat') {
      return null;
    }
    return (trend === 'up') !== this.lowerIsBetter();
  });

  protected readonly deltaText = computed(() => {
    const delta = this.delta();
    if (delta === null) {
      return '';
    }
    return `${delta > 0 ? '+' : ''}${delta}%`;
  });

  protected readonly trendIcon = computed(() => {
    switch (this.trend()) {
      case 'up':
        return 'trending_up';
      case 'down':
        return 'trending_down';
      default:
        return 'trending_flat';
    }
  });
}
