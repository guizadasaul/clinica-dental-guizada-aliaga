import {
  Directive,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
} from '@angular/core';

@Directive({
  selector: '[appMagnetic]',
  standalone: true,
})
export class MagneticDirective implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private animationFrame: number | null = null;

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = (event.clientX - centerX) * 0.25;
    const deltaY = (event.clientY - centerY) * 0.25;

    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.animationFrame = requestAnimationFrame(() => {
      this.el.nativeElement.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    });
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.animationFrame = requestAnimationFrame(() => {
      this.el.nativeElement.style.transform = 'translate(0, 0)';
      this.el.nativeElement.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    });
  }

  ngOnDestroy(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
}
