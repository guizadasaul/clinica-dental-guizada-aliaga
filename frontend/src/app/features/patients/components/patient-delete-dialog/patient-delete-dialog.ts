import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  afterNextRender,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/** Palabra que hay que escribir para confirmar la baja. */
export const DELETE_CONFIRMATION_WORD = 'eliminar';

/** Sin importar mayúsculas, tildes ni espacios de más. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Ventana de alerta para eliminar un paciente (CLI-184): dice a quién se
 * elimina y pide escribir "eliminar". La baja es lógica: nada se borra de la
 * base. Quien la usa hace la llamada y le pasa `busy` y `error`.
 */
@Component({
  selector: 'app-patient-delete-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './patient-delete-dialog.html',
  styleUrl: './patient-delete-dialog.scss',
})
export class PatientDeleteDialogComponent {
  readonly patientName = input.required<string>();
  readonly busy = input(false);
  /** Motivo por el que la API rechazó la baja (citas futuras, saldo…). */
  readonly error = input<string | null>(null);
  readonly confirmed = output<void>();
  readonly closed = output<void>();

  protected readonly confirmationWord = DELETE_CONFIRMATION_WORD;
  protected readonly typed = signal('');
  protected readonly canConfirm = computed(
    () => !this.busy() && normalize(this.typed()) === DELETE_CONFIRMATION_WORD,
  );

  private readonly confirmInput = viewChild<ElementRef<HTMLInputElement>>('confirmInput');

  constructor() {
    afterNextRender(() => this.confirmInput()?.nativeElement.focus());
  }

  protected onInput(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.busy()) {
      this.closed.emit();
    }
  }

  protected close(): void {
    if (!this.busy()) {
      this.closed.emit();
    }
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.canConfirm()) {
      this.confirmed.emit();
    }
  }
}
