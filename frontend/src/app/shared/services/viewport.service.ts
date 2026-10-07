import { DestroyRef, Injectable, inject, signal, type WritableSignal } from '@angular/core';
import { PANEL_MOBILE_BREAKPOINT, TABLET_BREAKPOINT } from '../constants/breakpoints.constants';

/**
 * Ancho de pantalla como señal (CLI-247), para lo que el CSS solo no alcanza:
 * por ejemplo, la agenda muestra un día en vez de la semana. Usa los mismos
 * cortes que los @media del panel (`down('md')` y `down('lg')`).
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly destroyRef = inject(DestroyRef);

  /** true en el celular (menos de 768 px de ancho). */
  readonly isMobile = this.watch(PANEL_MOBILE_BREAKPOINT);

  /**
   * true en el celular y en una tablet en vertical (menos de 1024 px): con el
   * sidebar al costado, lo que no entra en el celular tampoco entra ahí
   * (CLI-252: la semana de la agenda mostraba tres días).
   */
  readonly isCompact = this.watch(TABLET_BREAKPOINT);

  private watch(breakpoint: number): WritableSignal<boolean> {
    const query =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
        : null;
    const matches = signal(query?.matches ?? false);
    if (query) {
      const onChange = (event: MediaQueryListEvent) => matches.set(event.matches);
      query.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
    }
    return matches;
  }
}
