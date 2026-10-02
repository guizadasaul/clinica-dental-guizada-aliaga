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

/** Con reduced-motion el hero no arranca GSAP: los tests de comportamiento no lo necesitan. */
function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({
        matches: reduced,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
  );
}

function setup(options: { query?: Record<string, string>; mocks?: Partial<Mocks> } = {}) {
  const mocks: Mocks = {
    booking: {
      getDoctors: vi.fn().mockReturnValue(of(DOCTORS)),
      getAvailabilityRange: vi
        .fn()
        .mockReturnValue(of({ from: '2026-09-24', days: 14, slotsByDate: {} })),
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

describe('LandingComponent', () => {
  beforeEach(() => {
    stubMatchMedia(true);
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

  it('el hero lleva las dos partes del logo como marca de agua decorativa, una a cada lado (CLI-163)', async () => {
    const { fixture } = setup();
    await render(fixture);

    const marks = all(fixture, '.hero__watermark');
    expect(marks.map((m) => m.classList.contains('hero__watermark--left'))).toEqual([true, false]);
    expect(marks[1].classList).toContain('hero__watermark--right');
    // Decorativas: viven en el fondo, ocultas para lectores de pantalla.
    expect(marks.every((m) => m.closest('[aria-hidden="true"]'))).toBe(true);
  });

  it('si los comentarios no cargan, la sección queda sin testimonios (sin romper la página)', async () => {
    const { fixture } = setup({
      mocks: {
        testimonials: { getApproved: vi.fn().mockReturnValue(throwError(() => new Error('500'))) },
      },
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

      el(fixture, '.booking-modal')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
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

      (
        fixture.componentInstance as unknown as { onBookingDoctorSelected(id: string): void }
      ).onBookingDoctorSelected('doctor-1');
      await render(fixture);

      expect(mocks.booking.getAvailabilityRange).toHaveBeenCalledWith(
        expect.any(String),
        'doctor-1',
      );
      expect(el(fixture, 'app-week-slot-picker')).not.toBeNull();
      expect(el(fixture, 'app-doctor-picker')).toBeNull();
    });

    it('"elegir otro doctor" desde un doctor sin turnos vuelve al selector de doctores (CLI-142)', async () => {
      const { fixture } = await openModal();
      const landing = fixture.componentInstance as unknown as {
        onBookingDoctorSelected(id: string): void;
        onBookingChangeDoctor(): void;
      };
      landing.onBookingDoctorSelected('doctor-1');
      await render(fixture);

      landing.onBookingChangeDoctor();
      await render(fixture);

      expect(el(fixture, 'app-doctor-picker')).not.toBeNull();
      expect(el(fixture, 'app-week-slot-picker')).toBeNull();
    });

    it('si la disponibilidad falla, avisa con un error', async () => {
      const { fixture, mocks } = await openModal();
      mocks.booking.getAvailabilityRange.mockReturnValue(throwError(() => new Error('500')));

      (
        fixture.componentInstance as unknown as { onBookingDoctorSelected(id: string): void }
      ).onBookingDoctorSelected('doctor-1');
      await render(fixture);

      expect(
        (fixture.componentInstance as unknown as { bookingError(): string | null }).bookingError(),
      ).toContain('horarios');
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

      (
        fixture.componentInstance as unknown as { onBookingSlotSelected(slot: string): void }
      ).onBookingSlotSelected('2026-09-25T13:00:00Z');

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

      expect(
        (fixture.componentInstance as unknown as { bookingError(): string | null }).bookingError(),
      ).toContain('doctores');
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
    expect((fixture.componentInstance as unknown as { navScrolled(): boolean }).navScrolled()).toBe(
      true,
    );

    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    expect((fixture.componentInstance as unknown as { navScrolled(): boolean }).navScrolled()).toBe(
      false,
    );
  });

  it('el carrusel de odontólogos avanza, retrocede (dando la vuelta) y salta con los puntos', async () => {
    const { fixture } = setup();
    await render(fixture);
    const active = () =>
      (fixture.componentInstance as unknown as { activeDoctorIndex(): number }).activeDoctorIndex();
    const [prev, next] = all(fixture, '.doctor-spotlight__nav-btn');

    prev.click();
    expect(active()).toBe(1);
    next.click();
    expect(active()).toBe(0);
    all(fixture, '.doctor-spotlight__dot')[1].click();
    expect(active()).toBe(1);
  });
});

describe('LandingComponent — animaciones de GSAP', () => {
  beforeEach(() => {
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // GSAP se carga con import() dinámico: en una corrida completa puede tardar más que el timeout por defecto.
  it(
    'arma las animaciones del hero y de las secciones, y las revierte al destruirse',
    { timeout: 20_000 },
    async () => {
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
    },
  );
});
