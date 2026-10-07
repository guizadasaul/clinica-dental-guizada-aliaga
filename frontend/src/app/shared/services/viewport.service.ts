import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { PANEL_MOBILE_BREAKPOINT } from '../constants/breakpoints.constants';

/**
 * Ancho de pantalla como señal (CLI-247), para lo que el CSS solo no alcanza:
 * por ejemplo, la agenda muestra un día en vez de la semana en el celular.
 * Usa el mismo corte que los @media del panel (`down('md')`).
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly query =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(`(max-width: ${PANEL_MOBILE_BREAKPOINT - 1}px)`)
      : null;

  /** true en el celular (menos de 768 px de ancho). */
  readonly isMobile = signal(this.query?.matches ?? false);

  constructor() {
    if (!this.query) {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => this.isMobile.set(event.matches);
    this.query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.query?.removeEventListener('change', onChange));
  }
}
