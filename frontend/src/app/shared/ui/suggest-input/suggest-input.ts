import {
  AfterContentInit,
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  DestroyRef,
  ElementRef,
  Renderer2,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

const MAX_VISIBLE = 8;
let nextId = 0;

/** Sin mayúsculas, sin tildes y con los espacios colapsados (espejo de placeKey de la API). */
export function suggestionKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Sugerencias sobre un `<input>` de texto libre (CLI-178): envuelve el input
 * (marcado con `#suggestField`) en vez de dibujar uno propio, así el input
 * sigue siendo del formulario que lo contiene, con sus estilos, su `(input)`
 * y su validación. Filtra sin distinguir mayúsculas ni tildes, se elige con
 * mouse o teclado (flechas, Enter, Escape) y se puede escribir un valor nuevo.
 *
 * Elegir una sugerencia escribe el valor en el input y dispara su evento
 * `input`, igual que si se hubiera tipeado.
 */
@Component({
  selector: 'app-suggest-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './suggest-input.html',
  styleUrl: './suggest-input.scss',
})
export class SuggestInputComponent implements AfterContentInit {
  readonly suggestions = input<readonly string[]>([]);

  @ContentChild('suggestField', { read: ElementRef })
  private readonly fieldRef?: ElementRef<HTMLInputElement>;

  private readonly renderer = inject(Renderer2);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listId = `suggest-input-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  private readonly query = signal('');

  protected readonly matches = computed(() => {
    const key = suggestionKey(this.query());
    return this.suggestions()
      .filter((s) => {
        const k = suggestionKey(s);
        return k.includes(key) && k !== key;
      })
      .slice(0, MAX_VISIBLE);
  });

  protected readonly expanded = computed(() => this.open() && this.matches().length > 0);

  constructor() {
    // aria-expanded / aria-activedescendant sobre el input proyectado.
    effect(() => {
      // Leer las señales antes del early return: si no, la primera corrida
      // (antes de que exista el input proyectado) no las rastrea nunca.
      const expanded = this.expanded();
      const active = this.active();
      const el = this.fieldRef?.nativeElement;
      if (!el) return;
      this.renderer.setAttribute(el, 'aria-expanded', String(expanded));
      if (expanded && active >= 0) {
        this.renderer.setAttribute(el, 'aria-activedescendant', `${this.listId}-${active}`);
      } else {
        this.renderer.removeAttribute(el, 'aria-activedescendant');
      }
    });
  }

  ngAfterContentInit(): void {
    const el = this.fieldRef?.nativeElement;
    if (!el) return;
    this.renderer.setAttribute(el, 'aria-controls', this.listId);
    this.renderer.setAttribute(el, 'autocomplete', 'off');
    this.renderer.setAttribute(el, 'aria-expanded', 'false');
    this.query.set(el.value);

    const unlisten = [
      this.renderer.listen(el, 'input', () => {
        this.query.set(el.value);
        this.active.set(-1);
        this.open.set(true);
      }),
      this.renderer.listen(el, 'focus', () => {
        this.query.set(el.value);
        this.open.set(true);
      }),
      this.renderer.listen(el, 'blur', () => this.close()),
      this.renderer.listen(el, 'keydown', (event: KeyboardEvent) => this.onKeydown(event)),
    ];
    this.destroyRef.onDestroy(() => unlisten.forEach((fn) => fn()));
  }

  /** mousedown y no click: así el input no pierde el foco antes de elegir. */
  protected onOptionMousedown(event: MouseEvent, value: string): void {
    event.preventDefault();
    this.pick(value);
  }

  private onKeydown(event: KeyboardEvent): void {
    const count = this.matches().length;
    if (event.key === 'ArrowDown' && count > 0) {
      event.preventDefault();
      this.open.set(true);
      this.active.set(Math.min(this.active() + 1, count - 1));
    } else if (event.key === 'ArrowUp' && count > 0) {
      event.preventDefault();
      this.active.set(Math.max(this.active() - 1, 0));
    } else if (event.key === 'Enter' && this.expanded() && this.active() >= 0) {
      // Elegir la sugerencia resaltada sin enviar el formulario.
      event.preventDefault();
      this.pick(this.matches()[this.active()]);
    } else if (event.key === 'Escape' && this.expanded()) {
      event.preventDefault();
      this.close();
    }
  }

  private pick(value: string): void {
    const el = this.fieldRef?.nativeElement;
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    this.close();
  }

  private close(): void {
    this.open.set(false);
    this.active.set(-1);
  }
}
