import {
  Component,
  ChangeDetectionStrategy,
  AfterViewInit,
  OnDestroy,
  HostListener,
  ElementRef,
  signal,
  effect,
  inject,
  PLATFORM_ID,
  OnInit,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { OriginFillDirective } from '../../../shared/directives/origin-fill.directive';
import { LangSwitcherComponent } from '../../../shared/ui/lang-switcher/lang-switcher';
import { ScrollLockService } from '../../../shared/services/scroll-lock.service';
import { DoctorPickerComponent } from '../../../features/booking/components/doctor-picker/doctor-picker';
import { WeekSlotPickerComponent } from '../../../features/booking/components/week-slot-picker/week-slot-picker';
import { BookingService } from '../../../features/booking/services/booking.service';
import type { Doctor } from '../../../features/booking/models/booking.model';
import { TestimonialsService } from '../../../features/testimonials/services/testimonials.service';
import {
  CarouselTreatment,
  ThreeDCarouselComponent,
} from '../../../shared/ui/three-d-carousel/three-d-carousel';
import {
  WorkShowcaseItem,
  WorkShowcaseComponent,
} from '../../../shared/ui/work-showcase/work-showcase';
import {
  StaggerTestimonial,
  StaggerTestimonialsComponent,
} from '../../../shared/ui/stagger-testimonials/stagger-testimonials';
import { TestimonialCtaComponent } from '../../../shared/ui/testimonial-cta/testimonial-cta';
import { ChatWidgetComponent } from '../../../features/chatbot/components/chat-widget/chat-widget';

interface Instrument {
  readonly id: number;
  readonly src: string;
  readonly label: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    OriginFillDirective,
    TranslatePipe,
    LangSwitcherComponent,
    DoctorPickerComponent,
    WeekSlotPickerComponent,
    ThreeDCarouselComponent,
    WorkShowcaseComponent,
    StaggerTestimonialsComponent,
    TestimonialCtaComponent,
    ChatWidgetComponent,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bookingService = inject(BookingService);
  private readonly testimonialsService = inject(TestimonialsService);
  private readonly scrollLock = inject(ScrollLockService);


  protected readonly navScrolled = signal(false);
  // Alguien sin ficha de paciente asociada llega acá redirigido desde el
  // guard del dashboard (CLI-20) con ?sinFicha=1 en la URL.
  protected readonly showNoProfileBanner = signal(
    this.route.snapshot.queryParamMap.get('sinFicha') === '1',
  );

  protected readonly bookingDoctors = signal<Doctor[]>([]);
  protected readonly bookingDoctorsLoading = signal(true);
  protected readonly bookingSelectedDoctorId = signal<string | null>(null);
  protected readonly bookingSlotsByDate = signal<Record<string, string[]>>({});
  protected readonly bookingLoading = signal(false);
  protected readonly bookingError = signal<string | null>(null);
  // El selector de horarios ya no vive fijo en la landing: se abre en un
  // modal al apretar "Reservar Cita" (navbar o CTA de contacto).
  protected readonly bookingModalOpen = signal(false);
  protected readonly mobileMenuOpen = signal(false);
  private gsapContext: { revert(): void } | null = null;

  // El abanico se ordena visualmente de izquierda a derecha; el espejo bucal
  // (pieza más icónica) queda al centro y al frente.
  protected readonly instruments: Instrument[] = [
    {
      id: 1,
      src: 'assets/images/instruments/ExploradorCurvoVertical.png',
      label: 'landing.hero.instruments.explorer',
    },
    {
      id: 2,
      src: 'assets/images/instruments/Pinzas.png',
      label: 'landing.hero.instruments.tweezers',
    },
    {
      id: 3,
      src: 'assets/images/instruments/EspejoBucal.png',
      label: 'landing.hero.instruments.mirror',
    },
    {
      id: 4,
      src: 'assets/images/instruments/ExploradorDoblePunta.png',
      label: 'landing.hero.instruments.doubleExplorer',
    },
    {
      id: 5,
      src: 'assets/images/instruments/TurbinaDental.png',
      label: 'landing.hero.instruments.turbine',
    },
  ];

  protected readonly treatments: CarouselTreatment[] = [
    {
      id: 1,
      titleKey: 'landing.services.categories.general.title',
      itemsKey: 'landing.services.categories.general.items',
      descriptionKey: 'landing.services.categories.general.description',
      image: 'assets/images/treatments/Odontologia_General.png',
    },
    {
      id: 2,
      titleKey: 'landing.services.categories.esthetic.title',
      itemsKey: 'landing.services.categories.esthetic.items',
      descriptionKey: 'landing.services.categories.esthetic.description',
      image: 'assets/images/treatments/Estetica_Dental.png',
    },
    {
      id: 3,
      titleKey: 'landing.services.categories.periodontics.title',
      itemsKey: 'landing.services.categories.periodontics.items',
      descriptionKey: 'landing.services.categories.periodontics.description',
      image: 'assets/images/treatments/Periodoncia.png',
    },
    {
      id: 4,
      titleKey: 'landing.services.categories.endodontics.title',
      itemsKey: 'landing.services.categories.endodontics.items',
      descriptionKey: 'landing.services.categories.endodontics.description',
      image: 'assets/images/treatments/Endodoncia.png',
    },
    {
      id: 5,
      titleKey: 'landing.services.categories.surgery.title',
      itemsKey: 'landing.services.categories.surgery.items',
      descriptionKey: 'landing.services.categories.surgery.description',
      image: 'assets/images/treatments/Cirugia_Oral.png',
    },
    {
      id: 6,
      titleKey: 'landing.services.categories.implants.title',
      itemsKey: 'landing.services.categories.implants.items',
      descriptionKey: 'landing.services.categories.implants.description',
      image: 'assets/images/treatments/Implantologia.png',
    },
    {
      id: 7,
      titleKey: 'landing.services.categories.prosthetics.title',
      itemsKey: 'landing.services.categories.prosthetics.items',
      descriptionKey: 'landing.services.categories.prosthetics.description',
      image: 'assets/images/treatments/Protesis_Y_Rehabilitacion.png',
    },
    {
      id: 8,
      titleKey: 'landing.services.categories.ortho.title',
      itemsKey: 'landing.services.categories.ortho.items',
      descriptionKey: 'landing.services.categories.ortho.description',
      image: 'assets/images/treatments/Ortodoncia.png',
    },
    {
      id: 9,
      titleKey: 'landing.services.categories.rehabilitation.title',
      itemsKey: 'landing.services.categories.rehabilitation.items',
      descriptionKey: 'landing.services.categories.rehabilitation.description',
      image: 'assets/images/treatments/Rehabilitacion_Horal.png',
    },
  ];

  protected readonly workItems: WorkShowcaseItem[] = [
    {
      id: 1,
      titleKey: 'landing.work.items.smile.treatment',
      beforeUrl: 'assets/images/work/Antes1.png',
      beforeAlt: 'landing.work.items.smile.beforeAlt',
      afterUrl: 'assets/images/work/Despues1.png',
      afterAlt: 'landing.work.items.smile.afterAlt',
    },
    {
      id: 2,
      titleKey: 'landing.work.items.whitening.treatment',
      beforeUrl: 'assets/images/work/Antes2.png',
      beforeAlt: 'landing.work.items.whitening.beforeAlt',
      afterUrl: 'assets/images/work/Despues2.png',
      afterAlt: 'landing.work.items.whitening.afterAlt',
    },
    {
      id: 3,
      titleKey: 'landing.work.items.ortho.treatment',
      beforeUrl: 'assets/images/work/Antes3.png',
      beforeAlt: 'landing.work.items.ortho.beforeAlt',
      afterUrl: 'assets/images/work/Despues3.png',
      afterAlt: 'landing.work.items.ortho.afterAlt',
    },
    {
      id: 4,
      titleKey: 'landing.work.items.veneers1.treatment',
      beforeUrl: 'assets/images/work/Antes4.png',
      beforeAlt: 'landing.work.items.veneers1.beforeAlt',
      afterUrl: 'assets/images/work/Despues4.png',
      afterAlt: 'landing.work.items.veneers1.afterAlt',
    },
    {
      id: 5,
      titleKey: 'landing.work.items.resin.treatment',
      beforeUrl: 'assets/images/work/Antes5.png',
      beforeAlt: 'landing.work.items.resin.beforeAlt',
      afterUrl: 'assets/images/work/Despues5.png',
      afterAlt: 'landing.work.items.resin.afterAlt',
    },
    {
      id: 6,
      titleKey: 'landing.work.items.veneers2.treatment',
      beforeUrl: 'assets/images/work/Antes6.png',
      beforeAlt: 'landing.work.items.veneers2.beforeAlt',
      afterUrl: 'assets/images/work/Despues6.png',
      afterAlt: 'landing.work.items.veneers2.afterAlt',
    },
  ];

  // Los dos odontólogos de la clínica, mostrados de a uno en una tarjeta
  // grande que se navega con flechas/puntos (ver activeDoctorIndex).
  protected readonly doctors = ['ariel', 'marylu'] as const;
  // Fotos recortadas (fondo transparente); null mientras no haya foto real
  // todavía — cae al ícono de placeholder.
  protected readonly doctorPhotos: Record<(typeof this.doctors)[number], string | null> = {
    ariel: 'assets/images/doctors/DrArielGuizada.png',
    marylu: null,
  };
  protected readonly activeDoctorIndex = signal(0);

  protected selectDoctor(index: number): void {
    this.activeDoctorIndex.set(index);
  }

  protected prevDoctor(): void {
    this.activeDoctorIndex.update((i) => (i - 1 + this.doctors.length) % this.doctors.length);
  }

  protected nextDoctor(): void {
    this.activeDoctorIndex.update((i) => (i + 1) % this.doctors.length);
  }

  // Sin contenido hardcodeado: se llena entero desde el backend
  // (loadApprovedTestimonials), igual para los testimonios curados que
  // para los que deja la gente por el formulario.
  protected readonly testimonials = signal<StaggerTestimonial[]>([]);

  constructor() {
    effect((onCleanup) => {
      if (!this.bookingModalOpen()) {
        return;
      }
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
    });

    effect((onCleanup) => {
      if (!this.mobileMenuOpen()) {
        return;
      }
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
    });
  }

  ngOnInit(): void {
    void this.loadBookingDoctors();
    void this.loadApprovedTestimonials();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.navScrolled.set(window.scrollY > 50);
  }

  protected dismissNoProfileBanner(): void {
    this.showNoProfileBanner.set(false);
  }

  protected openBookingModal(): void {
    this.bookingModalOpen.set(true);
  }

  /** Cierra solo si el click cae en el fondo oscuro, no dentro del panel. */
  protected onBookingBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeBookingModal();
    }
  }

  protected closeBookingModal(): void {
    this.bookingModalOpen.set(false);
  }

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  // El scroll-lock se libera vía effect() (ver constructor), que corre
  // async respecto al click. Si dejamos que el <a href="#..."> navegue
  // nativo en el mismo click que cierra el menú, el navegador intenta
  // saltar al ancla mientras el overflow:hidden del lock todavía está
  // puesto y el salto no hace nada. Por eso interceptamos y reintentamos
  // el scroll en un tick posterior, cuando el lock ya se liberó.
  protected navigateToMobileSection(event: MouseEvent, sectionId: string): void {
    event.preventDefault();
    this.closeMobileMenu();
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView();
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.mobileMenuOpen()) {
      this.closeMobileMenu();
    }
    if (this.bookingModalOpen()) {
      this.closeBookingModal();
    }
  }

  protected onBookingDoctorSelected(doctorId: string): void {
    this.bookingSelectedDoctorId.set(doctorId);
    void this.loadBookingAvailability(doctorId);
  }

  /** Volver al selector de doctores desde un doctor sin turnos (CLI-142). */
  protected onBookingChangeDoctor(): void {
    this.bookingSelectedDoctorId.set(null);
    this.bookingSlotsByDate.set({});
  }

  protected onBookingSlotSelected(slot: string): void {
    const doctorId = this.bookingSelectedDoctorId();
    if (!doctorId) {
      return;
    }
    void this.router.navigate(['/reservar'], { queryParams: { slot, doctorId } });
  }

  private async loadBookingDoctors(): Promise<void> {
    this.bookingDoctorsLoading.set(true);
    this.bookingError.set(null);
    try {
      const result = await firstValueFrom(this.bookingService.getDoctors());
      this.bookingDoctors.set(result);
    } catch {
      this.bookingError.set('No pudimos cargar los doctores disponibles. Intentá de nuevo más tarde.');
    } finally {
      this.bookingDoctorsLoading.set(false);
    }
  }

  private async loadBookingAvailability(doctorId: string): Promise<void> {
    this.bookingLoading.set(true);
    this.bookingError.set(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const result = await firstValueFrom(this.bookingService.getAvailabilityRange(today, doctorId));
      this.bookingSlotsByDate.set(result.slotsByDate);
    } catch {
      this.bookingError.set('No pudimos cargar los horarios disponibles. Intentá de nuevo más tarde.');
    } finally {
      this.bookingLoading.set(false);
    }
  }

  private async loadApprovedTestimonials(): Promise<void> {
    try {
      const approved = await firstValueFrom(this.testimonialsService.getApproved());
      // El comentario/tratamiento reales no son claves de traducción: al no
      // existir esa clave en los JSON de i18n, el pipe `translate` devuelve
      // el texto tal cual (comportamiento estándar de ngx-translate), que es
      // justo lo que queremos para contenido escrito por pacientes.
      const mapped: StaggerTestimonial[] = approved.map((t) => ({
        id: t.id,
        quoteKey: t.comment,
        name: t.name,
        treatmentKey: t.treatment,
      }));
      this.testimonials.set(mapped);
    } catch {
      // Si falla, la sección de testimonios queda vacía — no hay contenido
      // hardcodeado de respaldo a propósito (los datos viven en la base).
    }
  }

  ngAfterViewInit(): void {
    void this.startVisualEffects();
  }

  /** Animaciones de GSAP, solo en el navegador y sin reduced-motion. */
  private async startVisualEffects(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    // Con reduced-motion no se inicializa GSAP: el CSS ya describe el estado
    // final (abanico abierto, secciones visibles), así que no falta nada.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    await this.initAnimations();
  }

  private async initAnimations(): Promise<void> {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ]);
    gsap.registerPlugin(ScrollTrigger);

    const root = this.host.nativeElement as HTMLElement;

    this.gsapContext = gsap.context(() => {
      // ------------------------------------------------------------
      // 1 · Entrada del hero: texto primero, luego el abanico se
      //     despliega desde el centro (cartas superpuestas → abiertas).
      //     clearProps devuelve el transform al CSS para que el hover
      //     (enderezar la carta) siga funcionando.
      // ------------------------------------------------------------
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });

      intro
        .from('.hero__title', { y: 36, opacity: 0, duration: 0.8 })
        .from('.hero__cta', { y: 20, opacity: 0, duration: 0.6 }, '-=0.45')
        .from(
          '.fan__item',
          {
            rotation: 0,
            y: 70,
            opacity: 0,
            duration: 0.95,
            ease: 'power4.out',
            stagger: { each: 0.08, from: 'center' },
            clearProps: 'transform,opacity',
          },
          '-=0.35',
        );

      // ------------------------------------------------------------
      // 2 · Parallax del hero: las capas de fondo (palabra fantasma y
      //     resplandor) bajan mientras el usuario scrollea, quedando
      //     "atrás" del contenido que sale a velocidad normal.
      // ------------------------------------------------------------
      const heroScroll = {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      };
      gsap.to('.hero__glow', { yPercent: 24, ease: 'none', scrollTrigger: heroScroll });
      gsap.to('.hero__fan', { y: 90, ease: 'none', scrollTrigger: heroScroll });

      // ------------------------------------------------------------
      // 3 · Scroll-reveal: fade-in + translateY al entrar al viewport.
      //     [data-reveal]           → elemento suelto
      //     [data-reveal-group]     → contenedor cuyos [data-reveal-item]
      //                               entran en cascada (stagger)
      //     data-reveal-item="x"    → entra desde la derecha (scroller
      //                               horizontal de casos)
      // ------------------------------------------------------------
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          y: 28,
          opacity: 0,
          duration: 0.75,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
          // Sin esto, el transform inline de GSAP se queda para siempre en
          // el elemento y lo convierte en "containing block" de sus hijos
          // position: fixed (ej. el modal de "Deja un comentario" dentro de
          // .testimonials-block) — el modal deja de cubrir toda la pantalla
          // y controles de fondo (como las flechas del carrusel) quedan
          // visibles por encima.
          clearProps: 'transform,opacity',
        });
      });

      gsap.utils.toArray<HTMLElement>('[data-reveal-group]').forEach((group) => {
        const items = Array.from(group.querySelectorAll<HTMLElement>('[data-reveal-item]'));
        if (items.length === 0) {
          return;
        }
        const horizontal = items[0].dataset['revealItem'] === 'x';
        gsap.from(items, {
          ...(horizontal ? { x: 48 } : { y: 32 }),
          opacity: 0,
          duration: 0.7,
          ease: 'power2.out',
          stagger: 0.09,
          scrollTrigger: { trigger: group, start: 'top 82%', once: true },
          clearProps: 'transform,opacity',
        });
      });
    }, root);
  }

  ngOnDestroy(): void {
    this.gsapContext?.revert();
    this.gsapContext = null;
  }
}
