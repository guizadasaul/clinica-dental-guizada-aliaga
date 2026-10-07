import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  type OnInit,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppointmentsService } from '../../services/appointments.service';
import { ScrollLockService } from '../../../../shared/services/scroll-lock.service';
import type { TimeBlock } from '../../models/appointment.model';
import { clinicSlotIso, minutesToHhmm } from '../../models/clinic-schedule.util';

/** "HH:MM" → minutos desde la medianoche, o null si no es una hora válida. */
function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** `message` del cuerpo de un error HTTP (string o string[] de class-validator), si trae algo usable. */
function backendMessage(err: unknown): string | null {
  const message = (err as { error?: { message?: unknown } } | null)?.error?.message;
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  if (Array.isArray(message) && typeof message[0] === 'string') {
    return message[0];
  }
  return null;
}

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const TIME_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Reservar un horario de la agenda (CLI-195): el doctor aparta un rango (una
 * emergencia, un curso) para que no le agenden pacientes. Sin `block` crea uno
 * nuevo (día, desde, hasta, motivo); con `block` muestra el que ya está y deja
 * quitarlo.
 */
@Component({
  selector: 'app-time-block-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './time-block-dialog.html',
  styleUrl: './time-block-dialog.scss',
})
export class TimeBlockDialogComponent implements OnInit {
  private readonly appointmentsService = inject(AppointmentsService);
  private readonly scrollLock = inject(ScrollLockService);

  /** Día de la clínica (YYYY-MM-DD) con el que arranca el formulario al crear. */
  readonly date = input<string>('');
  /** Un horario ya reservado: el diálogo lo muestra y deja quitarlo en vez de crear uno. */
  readonly block = input<TimeBlock | null>(null);

  readonly saved = output<TimeBlock>();
  readonly removed = output<string>();
  readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly day = signal('');
  protected readonly from = signal('09:00');
  protected readonly to = signal('10:00');
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly confirmingRemove = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly isExisting = computed(() => this.block() !== null);

  protected readonly rangeError = computed<string | null>(() => {
    const from = hhmmToMinutes(this.from());
    const to = hhmmToMinutes(this.to());
    if (!this.day()) {
      return 'Elige el día.';
    }
    if (from === null || to === null) {
      return 'Completa la hora de inicio y de fin.';
    }
    if (to <= from) {
      return 'La hora de fin tiene que ser posterior a la de inicio.';
    }
    return null;
  });

  protected readonly existingWhen = computed(() => {
    const block = this.block();
    if (!block) {
      return '';
    }
    const start = new Date(block.startsAt);
    const day = LONG_DATE_FORMATTER.format(start);
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${TIME_FORMATTER.format(start)} a ${TIME_FORMATTER.format(new Date(block.endsAt))}`;
  });

  constructor() {
    this.scrollLock.lock();
    inject(DestroyRef).onDestroy(() => this.scrollLock.unlock());
    afterNextRender(() => this.panel()?.nativeElement.focus());
  }

  ngOnInit(): void {
    this.day.set(this.date());
  }

  protected onDay(event: Event): void {
    this.day.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected onFrom(event: Event): void {
    this.from.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected onTo(event: Event): void {
    this.to.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected onReason(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  /** Atajo: de las 00:00 a las 23:55 del día. */
  protected wholeDay(): void {
    this.from.set('00:00');
    this.to.set('23:55');
    this.error.set(null);
  }

  protected async onSubmit(): Promise<void> {
    const from = hhmmToMinutes(this.from());
    const to = hhmmToMinutes(this.to());
    if (this.busy() || this.rangeError() || from === null || to === null) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const created = await firstValueFrom(
        this.appointmentsService.createTimeBlock({
          startsAt: clinicSlotIso(this.day(), from),
          endsAt: clinicSlotIso(this.day(), to),
          ...(this.reason().trim() && { reason: this.reason().trim() }),
        }),
      );
      this.saved.emit(created);
    } catch (err) {
      this.error.set(backendMessage(err) ?? 'No pudimos reservar el horario. Prueba de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  protected askRemove(): void {
    this.confirmingRemove.set(true);
  }

  protected keep(): void {
    this.confirmingRemove.set(false);
    this.error.set(null);
  }

  protected async confirmRemove(): Promise<void> {
    const block = this.block();
    if (!block || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.appointmentsService.deleteTimeBlock(block.id));
      this.removed.emit(block.id);
    } catch (err) {
      this.error.set(backendMessage(err) ?? 'No pudimos quitar la reserva. Prueba de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.closed.emit();
  }

  /** Cierra solo si el click cae en el fondo oscuro, no dentro del panel. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  protected hhmm(minutes: number): string {
    return minutesToHhmm(minutes);
  }
}
