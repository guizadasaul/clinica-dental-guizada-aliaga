import {
  Component,
  ChangeDetectionStrategy,
  AfterViewInit,
  OnDestroy,
  HostListener,
  ElementRef,
  ViewChild,
  signal,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { MagneticDirective } from '../../../shared/directives/magnetic.directive';
import { LangSwitcherComponent } from '../../../shared/ui/lang-switcher/lang-switcher';
import { WeekSlotPickerComponent } from '../../../features/booking/components/week-slot-picker/week-slot-picker';
import { BookingService } from '../../../features/booking/services/booking.service';

interface Instrument {
  readonly id: number;
  readonly src: string;
  readonly label: string;
}

interface WorkItem {
  readonly id: number;
  readonly beforeUrl: string;
  readonly beforeAlt: string;
  readonly afterUrl: string;
  readonly afterAlt: string;
  readonly treatment: string;
}

interface Testimonial {
  readonly id: number;
  readonly quote: string;
  readonly name: string;
  readonly treatment: string;
  readonly avatarUrl: string;
}

const BEFORE_AFTER_IMG =
  'https://lh3.googleusercontent.com/aida/ADBb0ujo5kojQwPwAnYW9jMgvrND7YRfpbUCFJy0iIdtvNaiU74nTPjunO9vHU7ZbhsEjsJ8Yd-tQjqLHTWwtkoQ1LmbI6MF_TwK-7uIzF8-CgcwsGTwU29OZFu7TSkNYcnyYhVOqg3q-8SbVM_OLqKiuITLeoh0tNwJFiS7dlndjGX-E-QWKpsD4LBAXsuR3usx0KQqCKihw011Hi32_gz0MGcHfBpaiudh7-UWldhCs2w3zQ2vHkU3xoqRiQVD';

const PATIENT_AVATAR =
  'https://lh3.googleusercontent.com/aida/ADBb0ui9XRS_CVf7bIZ7v3yrZnDiDLw4CPgWvIvgyoFRoGi56_9o56evTJLb7OC2rT5qJq61o_JHScdjanrEKlsnRGAs8AiF_g2Rg8ZhWlVbptgXJuEjm_zEhzzNH1uwITX97g-3vAUy8E_jfJHZMuuJgR-fRubLTJKZwhbSxaxAvu4gP8mdrgNFw-1_twkLhGw5GricB9Ejj9aCtRTuV3GaXiezeznarPaimf-KlxMowWRA7HM';

@Component({
  selector: 'app-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MagneticDirective, TranslatePipe, LangSwitcherComponent, WeekSlotPickerComponent],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class LandingComponent implements AfterViewInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bookingService = inject(BookingService);

  @ViewChild('spores') private sporeCanvas?: ElementRef<HTMLCanvasElement>;

  protected readonly navScrolled = signal(false);
  // Alguien sin ficha de paciente asociada llega acá redirigido desde el
  // guard del dashboard (CLI-20) con ?sinFicha=1 en la URL.
  protected readonly showNoProfileBanner = signal(
    this.route.snapshot.queryParamMap.get('sinFicha') === '1',
  );

  protected readonly bookingSlotsByDate = signal<Record<string, string[]>>({});
  protected readonly bookingLoading = signal(true);
  protected readonly bookingError = signal<string | null>(null);
  private gsapContext: { revert(): void } | null = null;
  private sporeCleanup: (() => void) | null = null;

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

  protected readonly workItems: WorkItem[] = [
    {
      id: 1,
      beforeUrl: BEFORE_AFTER_IMG,
      beforeAlt: 'landing.work.items.smile.beforeAlt',
      afterUrl: BEFORE_AFTER_IMG,
      afterAlt: 'landing.work.items.smile.afterAlt',
      treatment: 'landing.work.items.smile.treatment',
    },
    {
      id: 2,
      beforeUrl: BEFORE_AFTER_IMG,
      beforeAlt: 'landing.work.items.whitening.beforeAlt',
      afterUrl: BEFORE_AFTER_IMG,
      afterAlt: 'landing.work.items.whitening.afterAlt',
      treatment: 'landing.work.items.whitening.treatment',
    },
    {
      id: 3,
      beforeUrl: BEFORE_AFTER_IMG,
      beforeAlt: 'landing.work.items.ortho.beforeAlt',
      afterUrl: BEFORE_AFTER_IMG,
      afterAlt: 'landing.work.items.ortho.afterAlt',
      treatment: 'landing.work.items.ortho.treatment',
    },
  ];

  protected readonly testimonials: Testimonial[] = [
    {
      id: 1,
      quote: 'landing.testimonials.items.sofia.quote',
      name: 'Sofía Miranda',
      treatment: 'landing.testimonials.items.sofia.treatment',
      avatarUrl: PATIENT_AVATAR,
    },
    {
      id: 2,
      quote: 'landing.testimonials.items.carlos.quote',
      name: 'Carlos Vega',
      treatment: 'landing.testimonials.items.carlos.treatment',
      avatarUrl: PATIENT_AVATAR,
    },
    {
      id: 3,
      quote: 'landing.testimonials.items.andrea.quote',
      name: 'Andrea Flores',
      treatment: 'landing.testimonials.items.andrea.treatment',
      avatarUrl: PATIENT_AVATAR,
    },
  ];

  constructor() {
    void this.loadBookingAvailability();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.navScrolled.set(window.scrollY > 50);
  }

  protected dismissNoProfileBanner(): void {
    this.showNoProfileBanner.set(false);
  }

  protected onBookingSlotSelected(slot: string): void {
    void this.router.navigate(['/reservar'], { queryParams: { slot } });
  }

  private async loadBookingAvailability(): Promise<void> {
    this.bookingLoading.set(true);
    this.bookingError.set(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const result = await firstValueFrom(this.bookingService.getAvailabilityRange(today));
      this.bookingSlotsByDate.set(result.slotsByDate);
    } catch {
      this.bookingError.set('No pudimos cargar los horarios disponibles. Intentá de nuevo más tarde.');
    } finally {
      this.bookingLoading.set(false);
    }
  }

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    // Con reduced-motion no se inicializa GSAP: el CSS ya describe el estado
    // final (abanico abierto, secciones visibles), así que no falta nada.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    this.initSpores();
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
        });
      });
    }, root);
  }

  // ------------------------------------------------------------
  // Campo de esporas naranjas del hero.
  //
  // Cada espora tiene una posición "casa" (home) con densidad
  // gaussiana centrada donde converge el abanico. En reposo flota con
  // una deriva sinusoidal mínima; un resorte suave la devuelve siempre
  // a su casa. Cuando el cursor se acerca, un empuje radial la hace
  // "escapar" y luego el resorte la reasienta. Todo en canvas 2D para
  // que decenas de partículas no cuesten layout ni repaint del DOM.
  // ------------------------------------------------------------
  private initSpores(): void {
    const canvas = this.sporeCanvas?.nativeElement;
    const root = this.host.nativeElement as HTMLElement;
    const hero = root.querySelector<HTMLElement>('.hero');
    if (!canvas || !hero) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    interface Spore {
      fx: number; // casa como fracción del ancho/alto (sobrevive al resize)
      fy: number;
      hx: number; // casa en píxeles CSS
      hy: number;
      x: number; // posición actual
      y: number;
      vx: number;
      vy: number;
      r: number; // radio
      a: number; // opacidad base (ya muy sutil)
      tone: string; // tinte naranja
      phase: number; // desfase de la deriva
      drift: number; // velocidad de la deriva
    }

    // Naranjas de marca en distintas intensidades → profundidad orgánica.
    const TONES = ['232, 152, 88', '214, 124, 60', '245, 183, 120'];
    const spores: Spore[] = [];

    // Ruido ~normal (media 0, rango ~[-1, 1]) por suma de uniformes.
    const gauss = (): number =>
      (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
    const clamp01 = (n: number): number => Math.min(0.98, Math.max(0.02, n));

    let width = 0;
    let height = 0;

    // Núcleo del campo: el punto más denso, en el centro-abajo del hero.
    const CORE_X = 0.5;
    const CORE_Y = 0.72;

    const build = (): void => {
      spores.length = 0;
      // Menos partículas en mobile; el efecto debe ser un susurro.
      const count = width < 640 ? 1600 : 3060;
      for (let i = 0; i < count; i++) {
        // ~30% forman el núcleo denso alrededor del centro-abajo; el 70%
        // restante se esparce por todo el hero para que las zonas alejadas
        // queden bien pobladas, manteniendo la masa mayor abajo al centro.
        let fx: number;
        let fy: number;
        if (Math.random() < 0.2) {
          fx = clamp01(CORE_X + gauss() * 0.26);
          fy = clamp01(CORE_Y + gauss() * 0.2);
        } else {
          fx = clamp01(Math.random());
          fy = clamp01(Math.random());
        }
        // Cuanto más cerca del núcleo, un pelín más grande y visible.
        const distToCore = Math.hypot(fx - CORE_X, fy - CORE_Y);
        const centerBoost = Math.max(0, 1 - distToCore * 2.4);
        spores.push({
          fx,
          fy,
          hx: fx * width,
          hy: fy * height,
          x: fx * width,
          y: fy * height,
          vx: 0,
          vy: 0,
          r: 0.8 + Math.random() * 1.6 + centerBoost * 1.1,
          a: 0.1 + Math.random() * 0.22 + centerBoost * 0.16,
          tone: TONES[Math.floor(Math.random() * TONES.length)],
          phase: Math.random() * Math.PI * 2,
          drift: 0.6 + Math.random() * 0.8,
        });
      }
    };

    const resize = (): void => {
      const rect = hero.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // Trabajamos en píxeles CSS; el dpr se aplica una sola vez.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (spores.length === 0) {
        build();
      } else {
        for (const s of spores) {
          s.hx = s.fx * width;
          s.hy = s.fy * height;
        }
      }
    };

    // Cursor fuera de escena hasta que entre al hero.
    let mx = -9999;
    let my = -9999;
    const REPEL = 118; // radio de influencia del cursor (px CSS)

    const onPointerMove = (e: PointerEvent): void => {
      const rect = hero.getBoundingClientRect();
      mx = e.clientX - rect.left;
      my = e.clientY - rect.top;
    };
    const onPointerLeave = (): void => {
      mx = -9999;
      my = -9999;
    };

    let raf = 0;
    let running = false;

    const frame = (t: number): void => {
      ctx.clearRect(0, 0, width, height);
      for (const s of spores) {
        // Deriva ociosa: la "casa" respira apenas.
        const homeX = s.hx + Math.cos(t * 0.0004 * s.drift + s.phase) * 7;
        const homeY = s.hy + Math.sin(t * 0.0005 * s.drift + s.phase) * 9;

        // Resorte hacia casa.
        s.vx += (homeX - s.x) * 0.012;
        s.vy += (homeY - s.y) * 0.012;

        // Repulsión del cursor: escapan al pasar cerca.
        const dx = s.x - mx;
        const dy = s.y - my;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < REPEL * REPEL) {
          const dist = Math.sqrt(dist2) || 1;
          const force = (1 - dist / REPEL) * 2.6;
          s.vx += (dx / dist) * force;
          s.vy += (dy / dist) * force;
        }

        // Amortiguación → movimiento fluido, sin oscilar eternamente.
        s.vx *= 0.9;
        s.vy *= 0.9;
        s.x += s.vx;
        s.y += s.vy;

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.tone}, ${s.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };

    const start = (): void => {
      if (running) {
        return;
      }
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const stop = (): void => {
      running = false;
      cancelAnimationFrame(raf);
    };

    // Pausar el bucle cuando el hero sale del viewport (ahorro de CPU).
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0 },
    );

    resize();
    window.addEventListener('resize', resize);
    hero.addEventListener('pointermove', onPointerMove);
    hero.addEventListener('pointerleave', onPointerLeave);
    io.observe(hero);

    this.sporeCleanup = (): void => {
      stop();
      io.disconnect();
      window.removeEventListener('resize', resize);
      hero.removeEventListener('pointermove', onPointerMove);
      hero.removeEventListener('pointerleave', onPointerLeave);
    };
  }

  ngOnDestroy(): void {
    this.gsapContext?.revert();
    this.gsapContext = null;
    this.sporeCleanup?.();
    this.sporeCleanup = null;
  }
}
