import { SwipeGesture } from './swipe-gesture.util';

function pointer(clientX: number, pointerId = 1): PointerEvent {
  return { clientX, pointerId } as PointerEvent;
}

describe('SwipeGesture', () => {
  let now = 0;

  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => vi.restoreAllMocks());

  it('reporta el desplazamiento de cada paso y resume el gesto al soltar', () => {
    const swipe = new SwipeGesture();
    swipe.start(pointer(100));

    now += 10;
    expect(swipe.move(pointer(130))).toEqual({ dx: 30 });
    now += 10;
    expect(swipe.move(pointer(120))).toEqual({ dx: -10 });

    expect(swipe.end(pointer(120))).toEqual({
      velocity: -1, // último tramo: -10 px en 10 ms
      distance: 40, // |30| + |-10|: distingue un drag de un click
      netDx: 20,
    });
  });

  it('ignora otros punteros (multi-touch) y los eventos después de soltar', () => {
    const swipe = new SwipeGesture();
    swipe.start(pointer(0, 1));

    expect(swipe.move(pointer(50, 2))).toBeNull();
    expect(swipe.end(pointer(50, 2))).toBeNull();
    expect(swipe.end(pointer(0, 1))).not.toBeNull();
    expect(swipe.move(pointer(10, 1))).toBeNull();
  });

  it('evita dividir por cero si dos eventos llegan en el mismo milisegundo', () => {
    const swipe = new SwipeGesture();
    swipe.start(pointer(0));

    swipe.move(pointer(5));

    expect(swipe.end(pointer(5))?.velocity).toBe(5);
  });

  it('captura el puntero en el elemento indicado y sigue si el puntero ya no existe', () => {
    const target = { setPointerCapture: vi.fn() } as unknown as HTMLElement;
    new SwipeGesture().start(pointer(0, 7), target);
    expect(target.setPointerCapture).toHaveBeenCalledWith(7);

    const failing = {
      setPointerCapture: vi.fn(() => {
        throw new Error('InvalidPointerId');
      }),
    } as unknown as HTMLElement;
    const swipe = new SwipeGesture();
    expect(() => swipe.start(pointer(0), failing)).not.toThrow();
    expect(swipe.move(pointer(3))).toEqual({ dx: 3 });
  });
});
