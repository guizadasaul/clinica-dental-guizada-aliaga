import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OriginFillDirective } from './origin-fill.directive';

@Component({
  standalone: true,
  imports: [OriginFillDirective],
  template: `<button type="button" appOriginFill>Reservar <b>ya</b></button>`,
})
class HostComponent {}

function setup() {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    top: 50,
    width: 200,
    height: 40,
  } as DOMRect);
  return { button };
}

function pointer(type: string, init: { clientX?: number; clientY?: number; pointerType?: string } = {}): Event {
  const event = new MouseEvent(type, { clientX: init.clientX ?? 0, clientY: init.clientY ?? 0 });
  Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
  return event;
}

describe('OriginFillDirective', () => {
  afterEach(() => vi.restoreAllMocks());

  it('envuelve el contenido y agrega la capa de relleno, oculta para lectores de pantalla', () => {
    const { button } = setup();

    expect(button.classList).toContain('origin-fill');
    const [cover, content] = Array.from(button.children);
    expect(cover.className).toBe('origin-fill__cover');
    expect(cover.getAttribute('aria-hidden')).toBe('true');
    expect(content.className).toBe('origin-fill__content');
    expect(content.textContent).toBe('Reservar ya');
  });

  it('al entrar el puntero, el relleno nace en ese punto y cubre todo el botón', () => {
    const { button } = setup();

    button.dispatchEvent(pointer('pointerenter', { clientX: 110, clientY: 60 }));

    expect(button.classList).toContain('origin-fill--active');
    expect(button.style.getPropertyValue('--origin-fill-x')).toBe('10px');
    expect(button.style.getPropertyValue('--origin-fill-y')).toBe('10px');
    // Diámetro = 2 × distancia a la esquina más lejana (190, 30).
    expect(button.style.getPropertyValue('--origin-fill-size')).toBe(`${Math.ceil(2 * Math.hypot(190, 30))}px`);
  });

  it('se apaga al salir el puntero o al cancelarse', () => {
    const { button } = setup();
    button.dispatchEvent(pointer('pointerdown'));

    button.dispatchEvent(pointer('pointerleave'));
    expect(button.classList).not.toContain('origin-fill--active');

    button.dispatchEvent(pointer('pointerdown'));
    button.dispatchEvent(pointer('pointercancel'));
    expect(button.classList).not.toContain('origin-fill--active');
  });

  it('en táctil se apaga al levantar el dedo; con mouse sigue activo hasta salir', () => {
    const { button } = setup();

    button.dispatchEvent(pointer('pointerdown'));
    button.dispatchEvent(pointer('pointerup', { pointerType: 'mouse' }));
    expect(button.classList).toContain('origin-fill--active');

    button.dispatchEvent(pointer('pointerup', { pointerType: 'touch' }));
    expect(button.classList).not.toContain('origin-fill--active');
  });

  it('con foco de teclado el relleno arranca desde el centro; con foco de click, no', () => {
    const { button } = setup();
    const matches = vi.spyOn(button, 'matches');

    matches.mockReturnValue(false);
    button.dispatchEvent(new FocusEvent('focus'));
    expect(button.classList).not.toContain('origin-fill--active');

    matches.mockReturnValue(true);
    button.dispatchEvent(new FocusEvent('focus'));
    expect(button.classList).toContain('origin-fill--active');
    expect(button.style.getPropertyValue('--origin-fill-x')).toBe('100px');
    expect(button.style.getPropertyValue('--origin-fill-y')).toBe('20px');

    button.dispatchEvent(new FocusEvent('blur'));
    expect(button.classList).not.toContain('origin-fill--active');
  });
});
