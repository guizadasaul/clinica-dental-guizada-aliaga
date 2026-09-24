import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { StaggerTestimonialsComponent, type StaggerTestimonial } from './stagger-testimonials';

function items(count: number): StaggerTestimonial[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `t-${i + 1}`,
    quoteKey: `Comentario ${i + 1}`,
    name: `Persona ${i + 1}`,
    treatmentKey: 'Limpieza',
  }));
}

function setup(list = items(4), innerWidth = 1280) {
  Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true });
  TestBed.configureTestingModule({
    imports: [StaggerTestimonialsComponent],
    providers: [provideTranslateService({ defaultLanguage: 'es' })],
  });
  const fixture = TestBed.createComponent(StaggerTestimonialsComponent);
  fixture.componentRef.setInput('items', list);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const order = () =>
    Array.from(root.querySelectorAll('.stagger-card__by')).map((el) => (el.textContent ?? '').split(',')[0].trim());
  return { fixture, root, order };
}

function pointerEvent(type: string, clientX: number, pointerId = 1): PointerEvent {
  const event = new MouseEvent(type, { clientX, bubbles: true }) as PointerEvent;
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

describe('StaggerTestimonialsComponent', () => {
  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  it('muestra una tarjeta por testimonio', () => {
    const { order } = setup();

    expect(order()).toEqual(['— Persona 1', '— Persona 2', '— Persona 3', '— Persona 4']);
  });

  it('las flechas rotan la pila: la primera pasa al final y viceversa', () => {
    const { fixture, root, order } = setup();
    const [prev, next] = root.querySelectorAll<HTMLButtonElement>('.stagger-nav');

    next.click();
    fixture.detectChanges();
    expect(order()[3]).toBe('— Persona 1');

    prev.click();
    prev.click();
    fixture.detectChanges();
    expect(order()[0]).toBe('— Persona 4');
  });

  it('click en una tarjeta lateral la trae al centro', () => {
    const { fixture, root, order } = setup(items(4));

    // Con 4 tarjetas el centro es la posición 2; la 4.ª está un paso a la derecha.
    root.querySelectorAll<HTMLElement>('.stagger-card')[3].click();
    fixture.detectChanges();

    expect(order()[2]).toBe('— Persona 4');
  });

  it('con cantidad impar también centra la tarjeta elegida', () => {
    const { fixture, root, order } = setup(items(3));

    root.querySelectorAll<HTMLElement>('.stagger-card')[0].click();
    fixture.detectChanges();

    expect(order()[2]).toBe('— Persona 1');
  });

  it('la tarjeta central queda arriba y derecha; las laterales, inclinadas', () => {
    const { root } = setup(items(4));
    const cards = root.querySelectorAll<HTMLElement>('.stagger-card');

    expect(cards[2].style.transform).toContain('translateY(-65px)');
    expect(cards[2].style.transform).toContain('rotate(0deg)');
    expect(cards[1].style.transform).toContain('rotate(2.5deg)');
    expect(cards[0].style.transform).toContain('rotate(-2.5deg)');
  });

  it('los testimonios nuevos que llegan después se suman sin duplicar los que ya estaban', () => {
    const { fixture, order } = setup(items(2));

    fixture.componentRef.setInput('items', items(3));
    fixture.detectChanges();

    expect(order()).toEqual(['— Persona 1', '— Persona 2', '— Persona 3']);
  });

  describe('swipe', () => {
    it('deslizar a la izquierda avanza y a la derecha retrocede', () => {
      const { fixture, root, order } = setup();
      const stage = root.querySelector<HTMLElement>('.stagger-testimonials')!;

      stage.dispatchEvent(pointerEvent('pointerdown', 300));
      stage.dispatchEvent(pointerEvent('pointermove', 200));
      stage.dispatchEvent(pointerEvent('pointerup', 200));
      fixture.detectChanges();
      expect(order()[3]).toBe('— Persona 1');

      stage.dispatchEvent(pointerEvent('pointerdown', 200));
      stage.dispatchEvent(pointerEvent('pointermove', 300));
      stage.dispatchEvent(pointerEvent('pointerup', 300));
      fixture.detectChanges();
      expect(order()[0]).toBe('— Persona 1');
    });

    it('un movimiento corto no rota y el click que lo cierra tampoco cambia de tarjeta', () => {
      const { fixture, root, order } = setup();
      const stage = root.querySelector<HTMLElement>('.stagger-testimonials')!;
      const before = order();

      stage.dispatchEvent(pointerEvent('pointerdown', 300));
      stage.dispatchEvent(pointerEvent('pointermove', 280));
      stage.dispatchEvent(pointerEvent('pointerup', 280));
      root.querySelectorAll<HTMLElement>('.stagger-card')[3].click();
      fixture.detectChanges();

      expect(order()).toEqual(before);
    });

    it('apretar una flecha no inicia el swipe', () => {
      const { fixture, root } = setup();

      root.querySelector<HTMLElement>('.stagger-nav')!.dispatchEvent(pointerEvent('pointerdown', 0));
      fixture.detectChanges();

      expect(root.querySelector('.stagger-testimonials')?.className).not.toContain('--dragging');
    });

    it('mientras se arrastra, la pila lo refleja en su clase', () => {
      const { fixture, root } = setup();
      const stage = root.querySelector<HTMLElement>('.stagger-testimonials')!;

      stage.dispatchEvent(pointerEvent('pointerdown', 300));
      fixture.detectChanges();

      expect(stage.className).toContain('stagger-testimonials--dragging');
    });

    it('ignora el soltar de otro puntero', () => {
      const { fixture, root, order } = setup();
      const stage = root.querySelector<HTMLElement>('.stagger-testimonials')!;
      const before = order();

      stage.dispatchEvent(pointerEvent('pointerdown', 300, 1));
      stage.dispatchEvent(pointerEvent('pointerup', 0, 2));
      fixture.detectChanges();

      expect(order()).toEqual(before);
    });
  });

  it.each([
    [400, 380],
    [800, 410],
    [1280, 440],
  ])('con la ventana de %ipx las tarjetas miden %ipx de alto', (width, height) => {
    const { fixture, root } = setup(items(4), 1280);

    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(root.querySelector<HTMLElement>('.stagger-card')!.style.height).toBe(`${height}px`);
  });
});
