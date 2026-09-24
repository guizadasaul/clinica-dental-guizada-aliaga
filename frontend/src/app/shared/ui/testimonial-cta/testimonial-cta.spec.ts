import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TestimonialCtaComponent } from './testimonial-cta';
import { ScrollLockService } from '../../services/scroll-lock.service';

function setup() {
  const scrollLock = { lock: vi.fn(), unlock: vi.fn() };
  TestBed.configureTestingModule({
    imports: [TestimonialCtaComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTranslateService({ defaultLanguage: 'es' }),
      { provide: ScrollLockService, useValue: scrollLock },
    ],
  });
  const fixture = TestBed.createComponent(TestimonialCtaComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const open = () => {
    root.querySelector<HTMLButtonElement>('.testimonial-trigger')!.click();
    fixture.detectChanges();
  };
  return { fixture, root, scrollLock, open };
}

describe('TestimonialCtaComponent', () => {
  it('el botón abre el formulario en un <dialog> y bloquea el scroll', () => {
    const { root, scrollLock, open } = setup();

    expect(root.querySelector('dialog')).toBeNull();
    open();

    expect(
      root.querySelector('dialog.testimonial-modal__panel app-testimonial-form'),
    ).not.toBeNull();
    expect(scrollLock.lock).toHaveBeenCalled();
  });

  it('el botón de la esquina lo vuelve a cerrar', () => {
    const { fixture, root, open } = setup();
    open();

    root.querySelector<HTMLButtonElement>('.testimonial-trigger')!.click();
    fixture.detectChanges();

    expect(root.querySelector('dialog')).toBeNull();
  });

  it('click en el fondo lo cierra y libera el scroll; click dentro del panel, no', () => {
    const { fixture, root, scrollLock, open } = setup();
    open();

    root.querySelector<HTMLElement>('.testimonial-modal__panel')!.click();
    fixture.detectChanges();
    expect(root.querySelector('dialog')).not.toBeNull();

    root.querySelector<HTMLElement>('.testimonial-modal')!.click();
    fixture.detectChanges();
    expect(root.querySelector('dialog')).toBeNull();
    expect(scrollLock.unlock).toHaveBeenCalled();
  });

  it('se cierra con la X, con Escape en el fondo y con Escape en la página', () => {
    const { fixture, root, open } = setup();

    open();
    root.querySelector<HTMLButtonElement>('.testimonial-modal__close')!.click();
    fixture.detectChanges();
    expect(root.querySelector('dialog')).toBeNull();

    open();
    root
      .querySelector('.testimonial-modal')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('dialog')).toBeNull();

    open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(root.querySelector('dialog')).toBeNull();
  });

  it('Escape con el modal cerrado no hace nada', () => {
    const { fixture, root } = setup();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(root.querySelector('dialog')).toBeNull();
  });
});
