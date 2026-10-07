import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';
import { ViewportService } from '../services/viewport.service';

/** Alto de la topbar del panel en el celular, más un respiro. */
const TOPBAR_CLEARANCE = '72px';

/**
 * En el celular, lleva el elemento a la vista apenas aparece (CLI-249). Para
 * paneles que en escritorio se abren al costado y en el celular quedan
 * debajo, fuera de la pantalla: por ejemplo, el panel del diente tocado en el
 * odontograma. En escritorio no hace nada.
 */
@Directive({
  selector: '[appScrollIntoViewOnMobile]',
  standalone: true,
})
export class ScrollIntoViewOnMobileDirective {
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const viewport = inject(ViewportService);
    afterNextRender(() => {
      if (viewport.isMobile()) {
        // Que no quede debajo de la topbar fija del panel (56 px).
        host.style.scrollMarginTop = TOPBAR_CLEARANCE;
        host.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
}
