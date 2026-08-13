import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';

const CLINIC_TIMEZONE = 'America/La_Paz';

const timeFormatter = new Intl.DateTimeFormat('es-BO', {
  timeZone: CLINIC_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

interface SlotOption {
  iso: string;
  label: string;
}

@Component({
  selector: 'app-step-slot-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './step-slot-picker.html',
  styleUrl: './step-slot-picker.scss',
})
export class StepSlotPickerComponent {
  readonly date = input.required<string>();
  readonly slots = input<string[]>([]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);

  readonly dateChanged = output<string>();
  readonly slotSelected = output<string>();

  protected readonly slotOptions = computed<SlotOption[]>(() =>
    this.slots().map((iso) => ({ iso, label: timeFormatter.format(new Date(iso)) })),
  );

  protected readonly minDate = new Date().toISOString().slice(0, 10);

  protected onDateInput(value: string): void {
    if (value) {
      this.dateChanged.emit(value);
    }
  }
}
