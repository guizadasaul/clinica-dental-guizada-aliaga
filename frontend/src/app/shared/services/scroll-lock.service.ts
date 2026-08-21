import { Injectable } from '@angular/core';

/**
 * Bloquea el scroll de la página mientras haya al menos un modal abierto.
 * Cuenta bloqueos en vez de solo poner/sacar overflow:hidden a secas, para
 * que dos modales abiertos a la vez no se pisen al cerrarse uno de los dos.
 */
@Injectable({ providedIn: 'root' })
export class ScrollLockService {
  private locks = 0;

  lock(): void {
    this.locks++;
    if (this.locks === 1) {
      // overflow:hidden solo en <body> no alcanza: el elemento que
      // efectivamente scrollea la página es <html>, así que hay que
      // bloquear los dos para que la rueda del mouse, las flechas del
      // teclado y el scrollbar dejen de mover la página de fondo.
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }
  }

  unlock(): void {
    this.locks = Math.max(0, this.locks - 1);
    if (this.locks === 0) {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
  }
}
