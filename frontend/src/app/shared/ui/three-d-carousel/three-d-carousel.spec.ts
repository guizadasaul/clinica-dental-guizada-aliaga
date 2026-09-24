import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ThreeDCarouselComponent, type CarouselTreatment } from './three-d-carousel';

const ITEMS: CarouselTreatment[] = [1, 2, 3, 4].map((id) => ({
  id,
  titleKey: `tratamiento.${id}`,
  itemsKey: `tratamiento.${id}.items`,
  descriptionKey: `tratamiento.${id}.descripcion`,
  image: `img-${id}.png`,
}));

type Internals = {
  rotation(): number;
  activeIndex(): number;
  faceWidth(): number;
  isDragging(): boolean;
};

function setup(innerWidth = 1280) {
  Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true });
  TestBed.configureTestingModule({
    imports: [ThreeDCarouselComponent],
    providers: [provideTranslateService({ defaultLanguage: 'es' })],
  });
  const fixture = TestBed.createComponent(ThreeDCarouselComponent);
  fixture.componentRef.setInput('items', ITEMS);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const state = fixture.componentInstance as unknown as Internals;
  return { fixture, root, state };
}

function pointerEvent(type: string, clientX: number, pointerId = 1): PointerEvent {
  const event = new MouseEvent(type, { clientX, bubbles: true }) as PointerEvent;
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

describe('ThreeDCarouselComponent', () => {
  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it('arma una cara por tratamiento, repartidas en el cilindro', () => {
    const { root } = setup();

    const cards = root.querySelectorAll<HTMLElement>('.three-d-carousel__card');
    expect(cards).toHaveLength(4);
    expect(cards[1].style.transform).toContain('rotateY(90deg)');
  });

  it('las flechas giran de a una tarjeta y dan la vuelta en los extremos', () => {
    const { fixture, root, state } = setup();
    const [prev, next] = root.querySelectorAll<HTMLButtonElement>('.three-d-carousel__nav');

    next.click();
    fixture.detectChanges();
    expect(state.activeIndex()).toBe(1);
    expect(state.rotation()).toBe(-90);
    expect(root.querySelectorAll('.three-d-carousel__dot')[1].classList).toContain(
      'three-d-carousel__dot--active',
    );

    prev.click();
    prev.click();
    expect(state.activeIndex()).toBe(3);
    // Del 0 al 3 va por el camino corto (+90°), no da toda la vuelta.
    expect(state.rotation()).toBe(90);
  });

  it('los puntos saltan directo a una tarjeta', () => {
    const { root, state } = setup();

    root.querySelectorAll<HTMLButtonElement>('.three-d-carousel__dot')[2].click();

    expect(state.activeIndex()).toBe(2);
    expect(state.rotation()).toBe(-180);
  });

  it('"Conocer más" voltea la tarjeta y "Volver" la deja como estaba', () => {
    const { fixture, root } = setup();
    const card = () => root.querySelectorAll('.three-d-carousel__card-inner')[0];

    root.querySelector<HTMLButtonElement>('.three-d-carousel__link')!.click();
    fixture.detectChanges();
    expect(card().className).toContain('flipped');

    root.querySelector<HTMLButtonElement>('.three-d-carousel__back-btn')!.click();
    fixture.detectChanges();
    expect(card().className).not.toContain('flipped');
  });

  it('al pasar a otra tarjeta, la volteada vuelve a su frente', () => {
    const { fixture, root } = setup();
    root.querySelector<HTMLButtonElement>('.three-d-carousel__link')!.click();
    fixture.detectChanges();

    root.querySelectorAll<HTMLButtonElement>('.three-d-carousel__nav')[1].click();
    fixture.detectChanges();

    expect(root.querySelectorAll('.three-d-carousel__card-inner')[0].className).not.toContain('flipped');
  });

  describe('arrastre', () => {
    it('arrastrar gira el cilindro en vivo y al soltar marca la tarjeta que quedó al frente', () => {
      // Un arrastre lento (1 s por tramo): sin "flick" que lo siga girando al soltar.
      let now = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => (now += 1000));
      const { root, state } = setup();
      const track = root.querySelector<HTMLElement>('.three-d-carousel__track')!;
      const hit = root.querySelector<HTMLElement>('.three-d-carousel__hit')!;

      hit.dispatchEvent(pointerEvent('pointerdown', 600));
      expect(state.isDragging()).toBe(true);
      track.dispatchEvent(pointerEvent('pointermove', 100));
      expect(state.rotation()).toBeCloseTo(-90); // -500 px × 0.18
      track.dispatchEvent(pointerEvent('pointerup', 100));

      expect(state.isDragging()).toBe(false);
      expect(state.activeIndex()).toBe(1);
    });

    it('un "flick" rápido sigue girando el cilindro después de soltar', () => {
      const { root, state } = setup();
      const track = root.querySelector<HTMLElement>('.three-d-carousel__track')!;
      root.querySelector<HTMLElement>('.three-d-carousel__hit')!.dispatchEvent(pointerEvent('pointerdown', 600));
      track.dispatchEvent(pointerEvent('pointermove', 560));
      const afterDrag = state.rotation();

      track.dispatchEvent(pointerEvent('pointerup', 560));

      expect(state.rotation()).toBeLessThan(afterDrag);
    });

    it('un toque sin arrastre sobre una tarjeta la trae al frente', () => {
      const { root, state } = setup();
      const track = root.querySelector<HTMLElement>('.three-d-carousel__track')!;
      const hit = root.querySelectorAll<HTMLElement>('.three-d-carousel__hit')[4]; // frente de la 3.ª tarjeta

      hit.dispatchEvent(pointerEvent('pointerdown', 300));
      track.dispatchEvent(pointerEvent('pointerup', 300));
      hit.click();

      expect(state.activeIndex()).toBe(2);
    });

    it('el click que cierra un arrastre largo no cambia de tarjeta', () => {
      const { root, state } = setup();
      const track = root.querySelector<HTMLElement>('.three-d-carousel__track')!;
      const hit = root.querySelector<HTMLElement>('.three-d-carousel__hit')!;

      hit.dispatchEvent(pointerEvent('pointerdown', 600));
      track.dispatchEvent(pointerEvent('pointermove', 580));
      track.dispatchEvent(pointerEvent('pointerup', 580));
      const before = state.activeIndex();
      root.querySelectorAll<HTMLElement>('.three-d-carousel__hit')[4].click();

      expect(state.activeIndex()).toBe(before);
    });

    it('apretar un botón de la tarjeta no inicia el arrastre', () => {
      const { root, state } = setup();

      root.querySelector<HTMLElement>('.three-d-carousel__link')!.dispatchEvent(pointerEvent('pointerdown', 10));

      expect(state.isDragging()).toBe(false);
    });

    it('ignora movimientos de otro puntero', () => {
      const { root, state } = setup();
      const track = root.querySelector<HTMLElement>('.three-d-carousel__track')!;
      root.querySelector<HTMLElement>('.three-d-carousel__hit')!.dispatchEvent(pointerEvent('pointerdown', 0, 1));

      track.dispatchEvent(pointerEvent('pointermove', 500, 2));
      track.dispatchEvent(pointerEvent('pointerup', 500, 2));

      expect(state.rotation()).toBe(0);
      expect(state.isDragging()).toBe(true);
    });
  });

  it.each([
    [400, 250],
    [800, 280],
    [1280, 320],
  ])('con la ventana de %ipx cada cara mide %ipx', (width, face) => {
    const { state } = setup(1280);

    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(state.faceWidth()).toBe(face);
  });
});
