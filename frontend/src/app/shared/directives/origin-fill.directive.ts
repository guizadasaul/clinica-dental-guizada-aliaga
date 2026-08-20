import {
  AfterViewInit,
  Directive,
  ElementRef,
  OnDestroy,
  Renderer2,
  HostListener,
  inject,
} from '@angular/core';

/**
 * Aplica el efecto "origin fill": un círculo que se expande desde el punto
 * de origen (cursor, tap o foco de teclado) hasta cubrir el botón por
 * completo. Envuelve el contenido existente del host en un span propio para
 * poder apilarlo sobre el círculo sin alterar el markup del llamador.
 */
@Directive({
  selector: '[appOriginFill]',
  standalone: true,
})
export class OriginFillDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);

  ngAfterViewInit(): void {
    const host = this.el.nativeElement;
    this.renderer.addClass(host, 'origin-fill');

    const content = this.renderer.createElement('span') as HTMLSpanElement;
    this.renderer.addClass(content, 'origin-fill__content');
    while (host.firstChild) {
      this.renderer.appendChild(content, host.firstChild);
    }
    this.renderer.appendChild(host, content);

    const cover = this.renderer.createElement('span') as HTMLSpanElement;
    this.renderer.addClass(cover, 'origin-fill__cover');
    this.renderer.setAttribute(cover, 'aria-hidden', 'true');
    this.renderer.insertBefore(host, cover, content);
  }

  ngOnDestroy(): void {
    // El host se destruye junto con el elemento; nada que limpiar.
  }

  @HostListener('pointerenter', ['$event'])
  @HostListener('pointerdown', ['$event'])
  onPointerActivate(event: PointerEvent): void {
    this.setOrigin(event.clientX, event.clientY);
    this.setActive(true);
  }

  @HostListener('pointerleave')
  @HostListener('pointercancel')
  onPointerDeactivate(): void {
    this.setActive(false);
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      this.setActive(false);
    }
  }

  @HostListener('focus')
  onFocus(): void {
    const host = this.el.nativeElement as HTMLElement;
    if (!host.matches(':focus-visible')) {
      return;
    }
    this.setOriginToCenter();
    this.setActive(true);
  }

  @HostListener('blur')
  onBlur(): void {
    this.setActive(false);
  }

  private setOriginToCenter(): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    this.setOrigin(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  private setOrigin(clientX: number, clientY: number): void {
    const host = this.el.nativeElement as HTMLElement;
    const rect = host.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const size = Math.ceil(
      2 *
        Math.max(
          Math.hypot(x, y),
          Math.hypot(rect.width - x, y),
          Math.hypot(x, rect.height - y),
          Math.hypot(rect.width - x, rect.height - y),
        ),
    );

    host.style.setProperty('--origin-fill-x', `${x}px`);
    host.style.setProperty('--origin-fill-y', `${y}px`);
    host.style.setProperty('--origin-fill-size', `${size}px`);
  }

  private setActive(active: boolean): void {
    const host = this.el.nativeElement as HTMLElement;
    if (active) {
      this.renderer.addClass(host, 'origin-fill--active');
    } else {
      this.renderer.removeClass(host, 'origin-fill--active');
    }
  }
}
