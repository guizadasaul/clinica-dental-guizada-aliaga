import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BookingStepKey = 'doctor' | 'slot' | 'contact' | 'payment' | 'confirmed';

interface ProgressItem {
  readonly key: Exclude<BookingStepKey, 'confirmed'>;
  readonly label: string;
  readonly icon: string;
}

const ITEMS: readonly ProgressItem[] = [
  { key: 'doctor', label: 'Doctor', icon: 'person' },
  { key: 'slot', label: 'Horario', icon: 'event' },
  { key: 'contact', label: 'Tus datos', icon: 'badge' },
  { key: 'payment', label: 'Pago', icon: 'qr_code_2' },
];

type ItemState = 'done' | 'current' | 'todo';

/**
 * Indicador de progreso de la reserva (CLI-166): en qué paso está el
 * visitante y cuántos faltan. Solo presentación — el paso lo maneja la
 * página de reserva.
 */
@Component({
  selector: 'app-booking-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './booking-progress.html',
  styleUrl: './booking-progress.scss',
})
export class BookingProgressComponent {
  readonly step = input.required<BookingStepKey>();

  protected readonly items = computed(() => {
    const step = this.step();
    // En 'confirmed' todos quedan completos.
    const currentIndex = step === 'confirmed' ? ITEMS.length : ITEMS.findIndex((i) => i.key === step);
    return ITEMS.map((item, index) => ({ ...item, state: stateOf(index, currentIndex) }));
  });
}

function stateOf(index: number, currentIndex: number): ItemState {
  if (index < currentIndex) {
    return 'done';
  }
  return index === currentIndex ? 'current' : 'todo';
}
