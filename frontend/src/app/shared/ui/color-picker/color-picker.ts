import { Component, ChangeDetectionStrategy, input, model } from '@angular/core';
import { DOCTOR_COLOR_PALETTE } from '../../constants/doctor-colors';

/**
 * Selector del color con el que aparece el doctor en la agenda (CLI-110,
 * CLI-191): una paleta fija y, si hace falta, un color a medida. Emite siempre
 * "#rrggbb" en minúsculas.
 */
@Component({
  selector: 'app-color-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './color-picker.html',
  styleUrl: './color-picker.scss',
})
export class ColorPickerComponent {
  readonly value = model<string>('#2563eb');
  readonly inputId = input('color-picker');
  protected readonly palette = DOCTOR_COLOR_PALETTE;

  protected pick(color: string): void {
    this.value.set(color.toLowerCase());
  }
}
