import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/** Una opción elegible del catálogo (tratamiento, diagnóstico...). */
export interface CatalogPickerItem {
  readonly id: string;
  readonly label: string;
  readonly groupId: string;
  readonly groupLabel: string;
  /** Punto de color (ej. color de la categoría) — opcional. */
  readonly color?: string;
  /** Texto chico debajo del nombre (ej. "1 pieza") — opcional. */
  readonly hint?: string;
}

/** Atajo que va antes de las categorías (ej. "Frecuentes", "Sugeridos"): un subconjunto de ítems en un orden propio. */
export interface CatalogPickerExtraGroup {
  readonly id: string;
  readonly label: string;
  readonly itemIds: readonly string[];
}

interface Section {
  readonly title: string | null;
  readonly items: readonly CatalogPickerItem[];
}

const ALL = '__all__';

/** Minúsculas y sin tildes, para buscar "restauracion" y encontrar "Restauración". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/**
 * Selector de catálogo con buscador y chips de categoría (CLI-116): reemplaza
 * los `<select>` enormes de tratamientos y diagnósticos. Sin conocimiento de
 * dominio — quien lo usa arma los ítems. Una vez elegido algo se colapsa a
 * una fila con "Cambiar" para no ocupar el panel.
 */
@Component({
  selector: 'app-catalog-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog-picker.html',
  styleUrl: './catalog-picker.scss',
})
export class CatalogPickerComponent {
  readonly items = input<readonly CatalogPickerItem[]>([]);
  readonly selectedId = input<string | null>(null);
  /** Qué se elige, en singular ("tratamiento") — arma los textos del selector. */
  readonly noun = input('opción');
  readonly extraGroups = input<readonly CatalogPickerExtraGroup[]>([]);
  readonly selectedChange = output<string>();

  private readonly injector = inject(Injector);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly query = signal('');
  protected readonly activeGroup = signal<string>(ALL);
  /** Abierto = se ve el buscador y la lista; cerrado = solo la fila con lo elegido. */
  protected readonly open = signal(true);
  protected readonly activeIndex = signal(0);
  /** Chip por defecto ya aplicado — solo se re-aplica si cambian los atajos, no cada vez que el doctor elige otro. */
  private defaultChip: string | null = null;

  protected readonly selectedItem = computed(
    () => this.items().find((i) => i.id === this.selectedId()) ?? null,
  );

  /** Atajos con al menos un ítem existente, y después las categorías en el orden en que aparecen. */
  protected readonly chips = computed(() => {
    const itemIds = new Set(this.items().map((i) => i.id));
    const extras = this.extraGroups()
      .filter((g) => g.itemIds.some((id) => itemIds.has(id)))
      .map((g) => ({ id: g.id, label: g.label }));
    const groups: { id: string; label: string }[] = [];
    for (const item of this.items()) {
      if (!groups.some((g) => g.id === item.groupId)) {
        groups.push({ id: item.groupId, label: item.groupLabel });
      }
    }
    return [...extras, { id: ALL, label: 'Todos' }, ...groups];
  });

  /** Lo que se muestra: con búsqueda, en todo el catálogo agrupado por categoría; si no, según el chip. */
  protected readonly sections = computed<Section[]>(() => {
    const q = normalize(this.query());
    const items = this.items();
    if (q) {
      const words = q.split(/\s+/);
      const matches = items.filter((i) => {
        const label = normalize(i.label);
        return words.every((w) => label.includes(w));
      });
      return this.groupByCategory(matches);
    }
    const extra = this.extraGroups().find((g) => g.id === this.activeGroup());
    if (extra) {
      const byId = new Map(items.map((i) => [i.id, i]));
      const list = extra.itemIds.map((id) => byId.get(id)).filter((i): i is CatalogPickerItem => !!i);
      return [{ title: null, items: list }];
    }
    if (this.activeGroup() === ALL) {
      return this.groupByCategory(items);
    }
    return [{ title: null, items: items.filter((i) => i.groupId === this.activeGroup()) }];
  });

  /** Todas las opciones visibles en orden, para moverse con las flechas. */
  protected readonly visibleItems = computed(() => this.sections().flatMap((s) => s.items));

  constructor() {
    // Si ya viene algo elegido (ej. al editar), arranca cerrado; el primer
    // atajo (Sugeridos/Frecuentes) queda activo cuando existe.
    effect(() => {
      const selected = this.selectedItem();
      this.open.set(!selected);
    }, { allowSignalWrites: true });
    effect(() => {
      const first = this.chips()[0]?.id ?? ALL;
      if (first !== this.defaultChip) {
        this.defaultChip = first;
        this.activeGroup.set(first);
      }
    }, { allowSignalWrites: true });
  }

  private groupByCategory(items: readonly CatalogPickerItem[]): Section[] {
    const sections: { title: string; items: CatalogPickerItem[] }[] = [];
    for (const item of items) {
      let section = sections.find((s) => s.title === item.groupLabel);
      if (!section) {
        section = { title: item.groupLabel, items: [] };
        sections.push(section);
      }
      section.items.push(item);
    }
    return sections;
  }

  protected onQueryInput(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
  }

  protected onChip(id: string): void {
    this.activeGroup.set(id);
    this.query.set('');
    this.activeIndex.set(0);
  }

  protected onSelect(item: CatalogPickerItem): void {
    this.selectedChange.emit(item.id);
    this.open.set(false);
    this.query.set('');
  }

  protected onChange(): void {
    this.open.set(true);
    // El buscador recién existe después del próximo render.
    afterNextRender(() => this.searchInput()?.nativeElement.focus(), { injector: this.injector });
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.visibleItems().length;
    if (count === 0) { return; }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.update((i) => (i + 1) % count);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update((i) => (i - 1 + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = this.visibleItems()[this.activeIndex()];
      if (item) { this.onSelect(item); }
    }
  }

  protected isActive(item: CatalogPickerItem): boolean {
    return this.visibleItems()[this.activeIndex()]?.id === item.id;
  }

}
