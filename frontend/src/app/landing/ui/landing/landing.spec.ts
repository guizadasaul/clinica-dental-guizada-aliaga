import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { LandingComponent } from './landing';
import { BookingService } from '../../../features/booking/services/booking.service';
import { TestimonialsService } from '../../../features/testimonials/services/testimonials.service';
import { ScrollLockService } from '../../../shared/services/scroll-lock.service';
import type { Doctor } from '../../../features/booking/models/booking.model';
import type { TestimonialResponse } from '../../../features/testimonials/models/testimonial.model';

const DOCTORS: Doctor[] = [
  {
    id: 'doctor-1',
    displayName: 'Dr. Ariel Guizada',
    specialty: 'Odontología general',
    bio: null,
    photoUrl: null,
    displayOrder: 0,
    isBookable: true,
  },
];

const APPROVED: TestimonialResponse[] = [
  {
    id: 't-1',
    name: 'Laura',
    treatment: 'Limpieza',
    comment: 'Excelente atención',
    status: 'approved',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
];

interface Mocks {
  booking: { getDoctors: ReturnType<typeof vi.fn>; getAvailabilityRange: ReturnType<typeof vi.fn> };
  testimonials: { getApproved: ReturnType<typeof vi.fn> };
  scrollLock: { lock: ReturnType<typeof vi.fn>; unlock: ReturnType<typeof vi.fn> };
}

/** Con reduced-motion el hero no arranca GSAP ni el canvas: los tests de comportamiento no los necesitan. */
function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

function setup(options: { query?: Record<string, string>; mocks?: Partial<Mocks> } = {}) {
  const mocks: Mocks = {
    booking: {
      getDoctors: vi.fn().mockReturnValue(of(DOCTORS)),
      getAvailabilityRange: vi.fn().mockReturnValue(of({ from: '2026-09-24', days: 14, slotsByDate: {} })),
    },
    testimonials: { getApproved: vi.fn().mockReturnValue(of(APPROVED)) },
    scrollLock: { lock: vi.fn(), unlock: vi.fn() },
    ...options.mocks,
  };
  TestBed.configureTestingModule({
    imports: [LandingComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({ defaultLanguage: 'es' }),
      { provide: BookingService, useValue: mocks.booking },
      { provide: TestimonialsService, useValue: mocks.testimonials },
      { provide: ScrollLockService, useValue: mocks.scrollLock },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(options.query ?? {}) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(LandingComponent);
  return { fixture, mocks };
}

async function render(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function el<T extends Element = HTMLElement>(
  fixture: ReturnType<typeof setup>['fixture'],
  selector: string,
): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
}

function all(fixture: ReturnType<typeof setup>['fixture'], selector: string): HTMLElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(selector));
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  constructor(readonly callback: (entries: { isIntersecting: boolean }[]) => void) {
    FakeIntersectionObserver.instances.push(this);
  }
}

describe('LandingComponent', () => {
  beforeEach(() => {
    stubMatchMedia(true);
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('carga los doctores reservables y los comentarios aprobados al iniciar', async () => {
    const { fixture, mocks } = setup();

    await render(fixture);

    expect(mocks.booking.getDoctors).toHaveBeenCalledTimes(1);
    expect(mocks.testimonials.getApproved).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Excelente atención');
  });

  it('si los comentarios no cargan, la sección queda sin testimonios (sin romper la página)', async () => {
    const { fixture } = setup({
      mocks: { testimonials: { getApproved: vi.fn().mockReturnValue(throwError(() => new Error('500'))) } },
    });

    await render(fixture);

    expect(el(fixture, 'app-stagger-testimonials')).toBeNull();
  });

  describe('banner de "sin ficha"', () => {
    it('aparece si el guard redirigió con ?sinFicha=1 y se puede cerrar', async () => {
      const { fixture } = setup({ query: { sinFicha: '1' } });
      await render(fixture);

      const banner = el(fixture, '.no-profile-banner');
      expect(banner).not.toBeNull();
      expect(banner?.getAttribute('aria-live')).toBe('polite');

      (banner?.querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el(fixture, '.no-profile-banner')).toBeNull();
    });

    it('no aparece en una visita normal', async () => {
      const { fixture } = setup();
      await render(fixture);

      expect(el(fixture, '.no-profile-banner')).toBeNull();
    });
  });

  describe('modal de reserva', () => {
    async function openModal() {
      const context = setup();
      await render(context.fixture);
      (el(context.fixture, '.btn-primary') as HTMLButtonElement).click();
      context.fixture.detectChanges();
      return context;
    }

    it('se abre como <dialog> y bloquea el scroll de la página', async () => {
      const { fixture, mocks } = await openModal();

      expect(el(fixture, 'dialog.booking-modal__panel')).not.toBeNull();
      expect(mocks.scrollLock.lock).toHaveBeenCalled();
    });

    it('click en el fondo oscuro lo cierra y libera el scroll', async () => {
      const { fixture, mocks } = await openModal();

      (el(fixture, '.booking-modal') as HTMLElement).click();
      fixture.detectChanges();

      expect(el(fixture, '.booking-modal')).toBeNull();
      expect(mocks.scrollLock.unlock).toHaveBeenCalled();
    });

    it('click dentro del panel no lo cierra', async () => {
      const { fixture } = await openModal();

      (el(fixture, '.booking-modal__panel') as HTMLElement).click();
      fixture.detectChanges();

      expect(el(fixture, '.booking-modal')).not.toBeNull();
    });

    it('Escape lo cierra (en el fondo o desde cualquier lado de la página)', async () => {
      const { fixture } = await openModal();

      el(fixture, '.booking-modal')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(el(fixture, '.booking-modal')).toBeNull();

      (el(fixture, '.btn-primary') as HTMLButtonElement).click();
      fixture.detectChanges();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(el(fixture, '.booking-modal')).toBeNull();
    });

    it('el botón de cerrar lo cierra', async () => {
      const { fixture } = await openModal();

      (el(fixture, '.booking-modal__close') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el(fixture, '.booking-modal')).toBeNull();
    });

    it('elegir doctor carga su disponibilidad y muestra el selector de horarios', async () => {
      const { fixture, mocks } = await openModal();

      (fixture.componentInstance as unknown as { onBookingDoctorSelected(id: string): void }).onBookingDoctorSelected(
        'doctor-1',
      );
      await render(fixture);

      expect(mocks.booking.getAvailabilityRange).toHaveBeenCalledWith(expect.any(String), 'doctor-1');
      expect(el(fixture, 'app-week-slot-picker')).not.toBeNull();
      expect(el(fixture, 'app-doctor-picker')).toBeNull();
    });

    it('si la disponibilidad falla, avisa con un error', async () => {
      const { fixture, mocks } = await openModal();
      mocks.booking.getAvailabilityRange.mockReturnValue(throwError(() => new Error('500')));

      (fixture.componentInstance as unknown as { onBookingDoctorSelected(id: string): void }).onBookingDoctorSelected(
        'doctor-1',
      );
      await render(fixture);

      expect((fixture.componentInstance as unknown as { bookingError(): string | null }).bookingError()).toContain(
        'horarios',
      );
    });

    it('elegir horario lleva a /reservar con el doctor y el horario', async () => {
      const { fixture } = await openModal();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const component = fixture.componentInstance as unknown as {
        onBookingDoctorSelected(id: string): void;
        onBookingSlotSelected(slot: string): void;
      };

      component.onBookingDoctorSelected('doctor-1');
      component.onBookingSlotSelected('2026-09-25T13:00:00Z');

      expect(navigate).toHaveBeenCalledWith(['/reservar'], {
        queryParams: { slot: '2026-09-25T13:00:00Z', doctorId: 'doctor-1' },
      });
    });

    it('elegir horario sin doctor no navega', async () => {
      const { fixture } = await openModal();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

      (fixture.componentInstance as unknown as { onBookingSlotSelected(slot: string): void }).onBookingSlotSelected(
        '2026-09-25T13:00:00Z',
      );

      expect(navigate).not.toHaveBeenCalled();
    });

    it('si los doctores no cargan, lo avisa', async () => {
      const { fixture } = setup({
        mocks: {
          booking: {
            getDoctors: vi.fn().mockReturnValue(throwError(() => new Error('500'))),
            getAvailabilityRange: vi.fn(),
          },
        },
      });
      await render(fixture);

      expect((fixture.componentInstance as unknown as { bookingError(): string | null }).bookingError()).toContain(
        'doctores',
      );
    });
  });

  describe('menú mobile', () => {
    async function openMenu() {
      const context = setup();
      await render(context.fixture);
      (el(context.fixture, '.navbar__toggle') as HTMLButtonElement).click();
      context.fixture.detectChanges();
      return context;
    }

    it('se abre como <dialog> desde la hamburguesa', async () => {
      const { fixture } = await openMenu();

      expect(el(fixture, 'dialog.navbar__mobile-panel')).not.toBeNull();
      expect(el(fixture, '.navbar__toggle')?.getAttribute('aria-expanded')).toBe('true');
    });

    it('el fondo lo cierra con click o con Escape', async () => {
      const { fixture } = await openMenu();

      (el(fixture, '.navbar__mobile-backdrop') as HTMLElement).click();
      fixture.detectChanges();
      expect(el(fixture, '.navbar__mobile-panel')).toBeNull();

      (el(fixture, '.navbar__toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      el(fixture, '.navbar__mobile-backdrop')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      fixture.detectChanges();
      expect(el(fixture, '.navbar__mobile-panel')).toBeNull();
    });

    it('un link de sección cierra el menú y después scrollea a la sección', async () => {
      const { fixture } = await openMenu();
      const section = document.createElement('div');
      section.id = 'servicios';
      document.body.appendChild(section);
      // jsdom no implementa scrollIntoView.
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      vi.useFakeTimers();

      (all(fixture, '.navbar__mobile-link')[0] as HTMLAnchorElement).click();
      fixture.detectChanges();
      expect(el(fixture, '.navbar__mobile-panel')).toBeNull();
      expect(scrollIntoView).not.toHaveBeenCalled();

      vi.runAllTimers();
      expect(scrollIntoView).toHaveBeenCalled();
      section.remove();
      vi.useRealTimers();
    });

    it('"Reservar" desde el menú cierra el menú y abre el modal', async () => {
      const { fixture } = await openMenu();

      const reserve = all(fixture, '.navbar__mobile-panel button').at(-1) as HTMLButtonElement;
      reserve.click();
      fixture.detectChanges();

      expect(el(fixture, '.navbar__mobile-panel')).toBeNull();
      expect(el(fixture, '.booking-modal')).not.toBeNull();
    });
  });

  it('la barra de navegación cambia de estilo al scrollear', async () => {
    const { fixture } = setup();
    await render(fixture);

    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    expect((fixture.componentInstance as unknown as { navScrolled(): boolean }).navScrolled()).toBe(true);

    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    expect((fixture.componentInstance as unknown as { navScrolled(): boolean }).navScrolled()).toBe(false);
  });

  it('el carrusel de odontólogos avanza, retrocede (dando la vuelta) y salta con los puntos', async () => {
    const { fixture } = setup();
    await render(fixture);
    const active = () => (fixture.componentInstance as unknown as { activeDoctorIndex(): number }).activeDoctorIndex();
    const [prev, next] = all(fixture, '.doctor-spotlight__nav-btn');

    prev.click();
    expect(active()).toBe(1);
    next.click();
    expect(active()).toBe(0);
    all(fixture, '.doctor-spotlight__dot')[1].click();
    expect(active()).toBe(1);
  });
});

describe('LandingComponent — esporas del hero', () => {
  let ctx: Record<string, ReturnType<typeof vi.fn>>;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    stubMatchMedia(false);
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    // GSAP se prueba aparte: acá solo el canvas.
    vi.spyOn(LandingComponent.prototype as unknown as { initAnimations(): Promise<void> }, 'initAnimations')
      .mockResolvedValue(undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1200,
      height: 700,
      left: 0,
      top: 0,
    } as DOMRect);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Aleatoriedad fija: los tests no dependen de crypto ni de la suerte. */
  function sequence(values: number[]): () => number {
    let i = 0;
    return () => values[i++ % values.length];
  }

  /** Hace visible el hero y devuelve el cuadro que pidió el bucle de esporas. */
  function startLoop(): FrameRequestCallback {
    const before = frames.length;
    FakeIntersectionObserver.instances.at(-1)!.callback([{ isIntersecting: true }]);
    expect(frames.length).toBe(before + 1);
    return frames.at(-1)!;
  }

  async function renderWithSpores(random = sequence([0.1, 0.5, 0.9, 0.3])) {
    const { fixture } = setup();
    (fixture.componentInstance as unknown as { random: () => number }).random = random;
    await render(fixture);
    return fixture;
  }

  it('dibuja las partículas cuando el hero es visible y pausa cuando sale de pantalla', async () => {
    const fixture = await renderWithSpores();
    const io = FakeIntersectionObserver.instances.at(-1)!;

    expect(ctx['setTransform']).toHaveBeenCalled();
    const frame = startLoop();

    frame(16);
    // En desktop (ancho ≥ 640) arma 3060 esporas: una arc() por espora por cuadro.
    expect(ctx['arc']).toHaveBeenCalledTimes(3060);

    const pending = frames.length;
    io.callback([{ isIntersecting: true }]);
    expect(frames).toHaveLength(pending); // ya estaba corriendo: no arranca un segundo bucle

    io.callback([{ isIntersecting: false }]);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    fixture.destroy();
  });

  it('en pantallas angostas arma menos partículas', async () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({
      width: 400,
      height: 700,
      left: 0,
      top: 0,
    } as DOMRect);
    await renderWithSpores();

    startLoop()(16);

    expect(ctx['arc']).toHaveBeenCalledTimes(1600);
  });

  it('el cursor empuja a las esporas cercanas y al salir del hero deja de influir', async () => {
    const fixture = await renderWithSpores(sequence([0.5]));
    const hero = (fixture.nativeElement as HTMLElement).querySelector('.hero') as HTMLElement;
    const frame = startLoop();

    const pointer = new Event('pointermove') as PointerEvent;
    Object.assign(pointer, { clientX: 600, clientY: 350 });
    hero.dispatchEvent(pointer);
    frame(16);
    const pushed = ctx['arc'].mock.calls[0] as number[];

    ctx['arc'].mockClear();
    hero.dispatchEvent(new Event('pointerleave'));
    frames.at(-1)!(32);
    const calm = ctx['arc'].mock.calls[0] as number[];

    // Con el cursor encima, la espora se aleja de su casa más que sin cursor.
    expect(pushed[0]).not.toBe(calm[0]);
  });

  it('al redimensionar reubica las casas sin rearmar el campo', async () => {
    await renderWithSpores();
    const frame = startLoop();
    ctx['setTransform'].mockClear();

    window.dispatchEvent(new Event('resize'));

    expect(ctx['setTransform']).toHaveBeenCalledTimes(1);
    frame(16);
    expect(ctx['arc']).toHaveBeenCalledTimes(3060);
  });

  it('al destruirse corta el bucle, el observer y los listeners', async () => {
    const fixture = await renderWithSpores();
    const io = FakeIntersectionObserver.instances.at(-1)!;
    const removeWindow = vi.spyOn(window, 'removeEventListener');

    fixture.destroy();

    expect(io.disconnect).toHaveBeenCalled();
    expect(removeWindow).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('sin contexto 2D (navegador sin canvas) no hace nada', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);

    await renderWithSpores();

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });
});

describe('LandingComponent — animaciones de GSAP', () => {
  beforeEach(() => {
    stubMatchMedia(false);
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('arma las animaciones del hero y de las secciones, y las revierte al destruirse', async () => {
    const { fixture } = setup();
    await render(fixture);
    const component = fixture.componentInstance as unknown as {
      initAnimations(): Promise<void>;
      gsapContext: { revert(): void } | null;
    };

    // ngAfterViewInit ya la disparó; se espera la carga (import dinámico) de GSAP.
    await component.initAnimations();
    expect(component.gsapContext).not.toBeNull();
    const revert = vi.spyOn(component.gsapContext!, 'revert');

    fixture.destroy();

    expect(revert).toHaveBeenCalled();
  });
});
