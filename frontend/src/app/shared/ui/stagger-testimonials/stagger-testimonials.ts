import { ChangeDetectionStrategy, Component, HostListener, computed, effect, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LogoComponent } from '../logo/logo';

export interface StaggerTestimonial {
  readonly id: string;
  readonly quoteKey: string;
  readonly name: string;
  readonly treatmentKey: string;
}

/** Copia interna con una identidad (slotId) que cambia al "envolver" — ver handleMove. */
interface StaggerSlot extends StaggerTestimonial {
  readonly slotId: number;
}

interface CardDimensions {
  readonly width: number;
  readonly height: number;
}

const DESKTOP_CARD: CardDimensions = { width: 340, height: 440 };
const MOBILE_CARD: CardDimensions = { width: 270, height: 380 };
const MOBILE_BREAKPOINT = 640;

/**
 * Pila de testimonios escalonados: tarjetas superpuestas en abanico, la
 * central destacada. Click en una tarjeta lateral (o en las flechas) rota
 * la pila para traerla al centro. Puerto a Angular de un componente React
 * equivalente — el truco de "cambiar la key del ítem que da la vuelta"
 * para que esa tarjeta no anime (solo las demás deslizan) se replica acá
 * con `slotId`, usado como `track` en el @for.
 */
@Component({
  selector: 'app-stagger-testimonials',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, LogoComponent],
  templateUrl: './stagger-testimonials.html',
  styleUrl: './stagger-testimonials.scss',
})
export class StaggerTestimonialsComponent {
  readonly items = input.required<readonly StaggerTestimonial[]>();

  protected readonly slots = signal<StaggerSlot[]>([]);
  protected readonly card = signal<CardDimensions>(
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT ? MOBILE_CARD : DESKTOP_CARD,
  );
  protected readonly stageHeight = computed(() => this.card().height + 200);

  constructor() {
    // Suma a slots los items() nuevos (por id) sin tocar la posición/rotación
    // de las tarjetas ya montadas — así, si el padre agrega testimonios
    // aprobados después de la carga inicial (fetch async), se integran solos
    // al abanico en vez de reiniciarlo.
    effect(() => {
      const incoming = this.items();
      this.slots.update((current) => {
        const existingIds = new Set(current.map((slot) => slot.id));
        const toAdd = incoming
          .filter((item) => !existingIds.has(item.id))
          .map((item) => ({ ...item, slotId: Math.random() }));
        return toAdd.length ? [...current, ...toAdd] : current;
      });
    });
  }

  @HostListener('window:resize')
  protected onResize(): void {
    this.card.set(window.innerWidth < MOBILE_BREAKPOINT ? MOBILE_CARD : DESKTOP_CARD);
  }

  protected position(index: number): number {
    const length = this.slots().length;
    return length % 2 ? index - (length + 1) / 2 : index - length / 2;
  }

  protected cardTransform(position: number): string {
    const isCenter = position === 0;
    const x = (this.card().width / 1.5) * position;
    const y = isCenter ? -65 : position % 2 ? 15 : -15;
    const rotation = isCenter ? 0 : position % 2 ? 2.5 : -2.5;
    return `translate(-50%, -50%) translateX(${x}px) translateY(${y}px) rotate(${rotation}deg)`;
  }

  protected handleMove(steps: number): void {
    const list = [...this.slots()];
    if (steps > 0) {
      for (let i = steps; i > 0; i--) {
        const item = list.shift();
        if (!item) return;
        list.push({ ...item, slotId: Math.random() });
      }
      this.slots.set(list);
    } else if (steps < 0) {
      for (let i = steps; i < 0; i++) {
        const item = list.pop();
        if (!item) return;
        list.unshift({ ...item, slotId: Math.random() });
      }
      this.slots.set(list);
    }
  }
}
