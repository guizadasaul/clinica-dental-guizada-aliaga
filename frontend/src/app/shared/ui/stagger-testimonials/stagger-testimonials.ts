import { ChangeDetectionStrategy, Component, HostListener, computed, effect, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LogoComponent } from '../logo/logo';
import { MOBILE_BREAKPOINT, TABLET_BREAKPOINT } from '../../constants/breakpoints.constants';
import { SwipeGesture } from '../../utils/swipe-gesture.util';

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
const TABLET_CARD: CardDimensions = { width: 300, height: 410 };
const MOBILE_CARD: CardDimensions = { width: 270, height: 380 };

// Debajo de este desplazamiento neto, un swipe se trata como click normal
// de la tarjeta (ver onCardClick). Por encima, cambia de tarjeta.
const CLICK_DRAG_THRESHOLD = 6;
const SWIPE_TRIGGER_THRESHOLD = 40;

function resolveCard(viewportWidth: number): CardDimensions {
  if (viewportWidth < MOBILE_BREAKPOINT) return MOBILE_CARD;
  if (viewportWidth < TABLET_BREAKPOINT) return TABLET_CARD;
  return DESKTOP_CARD;
}

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

  /** Identidad nueva por cada copia que entra o "envuelve": solo tiene que ser única, no aleatoria. */
  private slotSeq = 0;
  private nextSlotId(): number {
    return ++this.slotSeq;
  }

  protected readonly slots = signal<StaggerSlot[]>([]);
  protected readonly card = signal<CardDimensions>(
    typeof window !== 'undefined' ? resolveCard(window.innerWidth) : DESKTOP_CARD,
  );
  protected readonly stageHeight = computed(() => this.card().height + 200);
  protected readonly isDragging = signal(false);

  private readonly swipe = new SwipeGesture();
  private lastDragDistance = 0;

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
          .map((item) => ({ ...item, slotId: this.nextSlotId() }));
        return toAdd.length ? [...current, ...toAdd] : current;
      });
    });
  }

  @HostListener('window:resize')
  protected onResize(): void {
    this.card.set(resolveCard(window.innerWidth));
  }

  protected onPointerDown(event: PointerEvent): void {
    // Los botones prev/next tienen su propio (click); no arrancamos el
    // drag ahí para no pisarles el click nativo (mismo criterio que el
    // carrusel 3D de servicios con sus botones internos).
    if ((event.target as HTMLElement).closest('.stagger-nav')) {
      return;
    }

    this.isDragging.set(true);
    this.swipe.start(event, event.currentTarget as HTMLElement);
  }

  protected onPointerMove(event: PointerEvent): void {
    this.swipe.move(event);
  }

  protected onPointerUp(event: PointerEvent): void {
    const result = this.swipe.end(event);
    if (!result) return;

    this.isDragging.set(false);
    this.lastDragDistance = result.distance;

    if (Math.abs(result.netDx) > SWIPE_TRIGGER_THRESHOLD) {
      // Swipe a la izquierda (netDx negativo) trae la siguiente tarjeta,
      // igual que el botón "next".
      this.handleMove(result.netDx < 0 ? 1 : -1);
    }
  }

  protected onCardClick(index: number): void {
    if (this.lastDragDistance > CLICK_DRAG_THRESHOLD) return;
    this.handleMove(this.position(index));
  }

  protected position(index: number): number {
    const length = this.slots().length;
    return length % 2 ? index - (length + 1) / 2 : index - length / 2;
  }

  protected cardTransform(position: number): string {
    const isCenter = position === 0;
    // Las tarjetas laterales alternan arriba/abajo e inclinación según su paridad.
    const side = position % 2 ? 1 : -1;
    const x = (this.card().width / 1.5) * position;
    const y = isCenter ? -65 : 15 * side;
    const rotation = isCenter ? 0 : 2.5 * side;
    return `translate(-50%, -50%) translateX(${x}px) translateY(${y}px) rotate(${rotation}deg)`;
  }

  protected handleMove(steps: number): void {
    const list = [...this.slots()];
    if (steps > 0) {
      for (let i = steps; i > 0; i--) {
        const item = list.shift();
        if (!item) return;
        list.push({ ...item, slotId: this.nextSlotId() });
      }
      this.slots.set(list);
    } else if (steps < 0) {
      for (let i = steps; i < 0; i++) {
        const item = list.pop();
        if (!item) return;
        list.unshift({ ...item, slotId: this.nextSlotId() });
      }
      this.slots.set(list);
    }
  }
}
