/** Resultado de un `move()` — desplazamiento horizontal desde el paso anterior. */
export interface SwipeMoveResult {
  readonly dx: number;
}

/** Resultado de un `end()` — resumen del gesto completo, desde `start()`. */
export interface SwipeEndResult {
  /** Velocidad instantánea (px/ms) del último tramo, con signo. */
  readonly velocity: number;
  /** Suma de desplazamientos absolutos — sirve para distinguir un click real de un drag. */
  readonly distance: number;
  /** Desplazamiento neto (con signo) desde el `start()` hasta el `end()`. */
  readonly netDx: number;
}

/**
 * Tracker de gesto de arrastre horizontal vía Pointer Events, extraído del
 * carrusel 3D de servicios para reutilizarse también en el carrusel de
 * testimonios (swipe táctil). No conoce nada del componente que lo usa —
 * cada carrusel decide qué hacer con `dx` durante el drag y con
 * `distance`/`velocity`/`netDx` al soltar.
 */
export class SwipeGesture {
  private pointerId: number | null = null;
  private startX = 0;
  private lastX = 0;
  private lastTime = 0;
  private velocity = 0;
  private distance = 0;

  start(event: PointerEvent, captureTarget?: HTMLElement): void {
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.lastX = event.clientX;
    this.lastTime = performance.now();
    this.velocity = 0;
    this.distance = 0;

    if (captureTarget) {
      try {
        captureTarget.setPointerCapture(event.pointerId);
      } catch {
        // Puntero ya inactivo (p. ej. multi-touch rápido): el gesto sigue
        // funcionando vía los listeners normales, solo sin captura.
      }
    }
  }

  move(event: PointerEvent): SwipeMoveResult | null {
    if (this.pointerId !== event.pointerId) return null;

    const now = performance.now();
    const dt = Math.max(now - this.lastTime, 1);
    const dx = event.clientX - this.lastX;

    this.velocity = dx / dt;
    this.distance += Math.abs(dx);
    this.lastX = event.clientX;
    this.lastTime = now;

    return { dx };
  }

  end(event: PointerEvent): SwipeEndResult | null {
    if (this.pointerId !== event.pointerId) return null;

    this.pointerId = null;
    return {
      velocity: this.velocity,
      distance: this.distance,
      netDx: this.lastX - this.startX,
    };
  }
}
