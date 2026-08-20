import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export interface CarouselTreatment {
  readonly id: number;
  readonly titleKey: string;
  /** Clave de traducción cuyo valor en los JSON de i18n es un array de strings. */
  readonly itemsKey: string;
  readonly descriptionKey: string;
  readonly image: string;
}

const DESKTOP_FACE_WIDTH = 320;
const MOBILE_FACE_WIDTH = 250;
const MOBILE_BREAKPOINT = 640;
const DRAG_ROTATION_FACTOR = 0.18;
const FLICK_ROTATION_FACTOR = 45;
const CLICK_DRAG_THRESHOLD = 6;
const SETTLE_TRANSITION = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Carrusel 3D de tratamientos: cilindro de tarjetas que rota con drag/flick
 * (puntero) o con los controles prev/next. Puerto a Angular (sin
 * framer-motion) de un componente React equivalente — la rotación vive en
 * un signal y se aplica vía CSS transform, con una transición de "settle"
 * que se desactiva mientras se arrastra para que el seguimiento sea 1:1.
 */
@Component({
  selector: 'app-three-d-carousel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './three-d-carousel.html',
  styleUrl: './three-d-carousel.scss',
})
export class ThreeDCarouselComponent {
  readonly items = input.required<readonly CarouselTreatment[]>();

  protected readonly rotation = signal(0);
  protected readonly activeIndex = signal(0);
  protected readonly isDragging = signal(false);
  protected readonly flippedIndices = signal<ReadonlySet<number>>(new Set());
  protected readonly faceWidth = signal(
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
      ? MOBILE_FACE_WIDTH
      : DESKTOP_FACE_WIDTH,
  );

  protected readonly faceAngle = computed(() => 360 / (this.items().length || 1));
  // El cilindro crece con la cantidad de tarjetas para que cada cara
  // mantenga siempre el mismo ancho, sin importar si hay 4 o 9 ítems.
  protected readonly cylinderWidth = computed(() => this.faceWidth() * (this.items().length || 1));
  protected readonly radius = computed(() => this.cylinderWidth() / (2 * Math.PI));
  protected readonly settleTransition = SETTLE_TRANSITION;

  private pointerId: number | null = null;
  private lastX = 0;
  private lastTime = 0;
  private velocity = 0;
  private dragDistance = 0;

  @HostListener('window:resize')
  protected onResize(): void {
    this.faceWidth.set(window.innerWidth < MOBILE_BREAKPOINT ? MOBILE_FACE_WIDTH : DESKTOP_FACE_WIDTH);
  }

  protected faceTransform(index: number): string {
    return `rotateY(${index * this.faceAngle()}deg) translateZ(${this.radius()}px)`;
  }

  protected onPointerDown(event: PointerEvent): void {
    // Si el press arrancó en un control real de la tarjeta (Conocer más,
    // Volver, Reservar consulta), no iniciamos el drag del cilindro acá
    // arriba: capturar el puntero puede pisar el `click` nativo del botón.
    // El .three-d-carousel__hit (arrastrar/seleccionar tarjeta) sigue
    // iniciando el drag con normalidad.
    if ((event.target as HTMLElement).closest('.three-d-carousel__link, .three-d-carousel__back-btn')) {
      return;
    }

    this.pointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastTime = performance.now();
    this.velocity = 0;
    this.dragDistance = 0;
    this.isDragging.set(true);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Puntero ya inactivo (p. ej. multi-touch rápido): el drag sigue
      // funcionando vía los listeners normales, solo sin captura.
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId) return;

    const now = performance.now();
    const dt = Math.max(now - this.lastTime, 1);
    const dx = event.clientX - this.lastX;

    this.velocity = dx / dt;
    this.dragDistance += Math.abs(dx);
    this.rotation.update((value) => value + dx * DRAG_ROTATION_FACTOR);
    this.lastX = event.clientX;
    this.lastTime = now;
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId) return;
    this.pointerId = null;
    this.isDragging.set(false);

    const flick = this.velocity * FLICK_ROTATION_FACTOR;
    if (Math.abs(flick) > 2) {
      this.rotation.update((value) => value + flick);
    }
    if (this.dragDistance > CLICK_DRAG_THRESHOLD) {
      this.syncActiveIndexToRotation();
    }
  }

  protected onCardClick(index: number): void {
    if (this.dragDistance > CLICK_DRAG_THRESHOLD) return;
    this.focusCard(index);
  }

  protected isFlipped(index: number): boolean {
    return this.flippedIndices().has(index);
  }

  protected toggleFlip(index: number): void {
    const next = new Set(this.flippedIndices());
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    this.flippedIndices.set(next);
  }

  /** Tras un drag libre (sin snap), refleja en los dots cuál tarjeta quedó al frente. */
  private syncActiveIndexToRotation(): void {
    const count = this.items().length;
    const nearest = Math.round(-this.rotation() / this.faceAngle());
    this.setActiveIndex(((nearest % count) + count) % count);
  }

  protected rotateBy(steps: number): void {
    const count = this.items().length;
    const nextIndex = ((this.activeIndex() + steps) % count + count) % count;
    this.focusCard(nextIndex);
  }

  /** Al pasar a otra tarjeta, la que haya quedado volteada vuelve a su estado natural. */
  private setActiveIndex(index: number): void {
    if (this.activeIndex() !== index) {
      this.flippedIndices.set(new Set());
    }
    this.activeIndex.set(index);
  }

  private focusCard(index: number): void {
    this.setActiveIndex(index);

    const target = -index * this.faceAngle();
    const current = this.rotation();
    const delta = (((target - current + 180) % 360) + 360) % 360 - 180;
    this.rotation.set(current + delta);
  }
}
