import { Component, ChangeDetectionStrategy, computed, model } from '@angular/core';
import { WEEKDAY_LABELS, scheduleError, type ScheduleBlock } from '../../utils/schedule-blocks.util';

/**
 * Editor del horario semanal de atención (CLI-191): una fila por tramo con día,
 * desde y hasta. Muestra el error de coherencia (inicio antes del fin, sin
 * solapamientos) y deja al padre decidir si guarda.
 */
@Component({
  selector: 'app-schedule-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './schedule-editor.html',
  styleUrl: './schedule-editor.scss',
})
export class ScheduleEditorComponent {
  readonly blocks = model<ScheduleBlock[]>([]);
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly error = computed(() => scheduleError(this.blocks()));

  protected add(): void {
    this.blocks.update((blocks) => [...blocks, { weekday: 1, start: '09:00', end: '12:00' }]);
  }

  protected remove(index: number): void {
    this.blocks.update((blocks) => blocks.filter((_, i) => i !== index));
  }

  protected setWeekday(index: number, event: Event): void {
    const weekday = Number((event.target as HTMLSelectElement).value);
    this.patch(index, { weekday });
  }

  protected setStart(index: number, event: Event): void {
    this.patch(index, { start: (event.target as HTMLInputElement).value });
  }

  protected setEnd(index: number, event: Event): void {
    this.patch(index, { end: (event.target as HTMLInputElement).value });
  }

  private patch(index: number, change: Partial<ScheduleBlock>): void {
    this.blocks.update((blocks) => blocks.map((b, i) => (i === index ? { ...b, ...change } : b)));
  }
}
