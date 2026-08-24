import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { ODONTOGRAM_CELLS, type OdontogramCell } from '../../constants/odontogram-cells';

export interface OdontogramLegendItem {
  readonly name: string;
  readonly color: string;
}

/**
 * El odontograma SVG interactivo — dibujo estático + overlay de celdas
 * clickeables, compartido por el flujo de diagnóstico
 * (patient-wizard/steps/step-odontogram) y el de registro de tratamientos
 * (treatments/register-treatment-odontogram), para que sean visualmente
 * idénticos (CLI-41). Sin conocimiento de dominio: quien lo usa decide qué
 * color pintar por diente y qué dientes están "seleccionados" — este
 * componente solo dibuja y emite clics.
 */
@Component({
  selector: 'app-odontogram-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './odontogram-chart.html',
  styleUrl: './odontogram-chart.scss',
})
export class OdontogramChartComponent {
  /** Color de fondo por diente ya marcado (diagnóstico o tratamiento) — vacío si sano/sin marcar. */
  readonly toothColor = input<ReadonlyMap<number, string>>(new Map());
  /** Dientes resaltados como "seleccionados en este momento" (edición en curso). */
  readonly selectedTeeth = input<readonly number[]>([]);
  readonly legendItems = input<readonly OdontogramLegendItem[]>([]);
  readonly toothClick = output<number>();

  protected readonly cells = ODONTOGRAM_CELLS;
  protected readonly odontogramUrl = '/assets/svg/odontogram.svg';

  protected isDiagnosed(toothNumber: number): boolean {
    return this.toothColor().has(toothNumber);
  }

  protected isSelected(toothNumber: number): boolean {
    return this.selectedTeeth().includes(toothNumber);
  }

  protected paintFill(toothNumber: number): string {
    const color = this.toothColor().get(toothNumber);
    if (color) { return color; }
    if (this.isSelected(toothNumber)) { return '#1a2b5e'; }
    return 'transparent';
  }

  protected onCellClick(cell: OdontogramCell): void {
    this.toothClick.emit(cell.number);
  }
}
