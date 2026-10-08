import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  effect,
} from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import type { Treatment, TreatmentApplicationType } from '../../models/treatment.model';
import {
  teethForApplicationType,
  applicationTypeImpliesTeeth,
} from '../../../../shared/constants/dental-chart.constants';
import { OdontogramChartComponent } from '../../../../shared/ui/odontogram-chart/odontogram-chart';
import {
  EMPTY_PATIENT_ODONTOGRAM,
  type PatientOdontogram,
} from '../../../../shared/utils/patient-odontogram.util';

interface CategoryChip {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

/** Minúsculas y sin tildes: "extraccion" encuentra "Extracción". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export interface TreatmentScopeSelection {
  readonly treatment: Treatment;
  readonly toothNumbers: number[];
}


/**
 * Elige un tratamiento y los dientes a los que aplica, respetando su
 * `applicationType`: single_tooth (uno solo, clic reemplaza),
 * multiple_teeth (1+, clic togglea), upper_arch/lower_arch/full_mouth
 * (predeterminados por el tipo, sin clic) y el resto (general,
 * soft_tissue, frenulum, prosthesis, orthodontic, unit, box) sin
 * odontograma. Emite la selección completa apenas es válida — quien lo usa
 * (quote-builder) reacciona a eso, no hay botón de "confirmar" acá: en
 * `single_tooth` el clic ya confirmaba antes de este cambio, y en
 * `multiple_teeth` marcar 1 diente ya es la confirmación.
 *
 * El tratamiento se elige de un catálogo con buscador, chips de categoría y
 * "Frecuentes" del doctor (CLI-157) — antes era un <select> con el catálogo
 * completo. Una vez elegido, el catálogo se colapsa en una tarjeta con
 * "Cambiar" para que el odontograma quede a la vista.
 *
 * Lo usa solo el armado de presupuesto (quote-builder). Desde CLI-256 pinta
 * con el mismo odontograma que diagnóstico y tratamientos
 * (`OdontogramChartComponent`), con el diagnóstico vigente del paciente que
 * le pasa quote-builder; el dibujo propio de dientes cuadrados se eliminó.
 */
@Component({
  selector: 'app-treatment-scope-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, NgTemplateOutlet, OdontogramChartComponent],
  templateUrl: './treatment-scope-picker.html',
  styleUrl: './treatment-scope-picker.scss',
})
export class TreatmentScopePickerComponent {
  readonly treatments = input.required<Treatment[]>();
  /** Diagnóstico vigente y tratamientos del paciente, ya listos para pintar (CLI-256). */
  readonly odontogram = input<PatientOdontogram>(EMPTY_PATIENT_ODONTOGRAM);
  /** Ids de los tratamientos más usados por el doctor, el más usado primero (CLI-118). */
  readonly frequentIds = input<string[]>([]);
  readonly selectionChange = output<TreatmentScopeSelection | null>();


  protected readonly search = signal('');
  /** categoryId elegido en los chips; '' = todas. */
  protected readonly category = signal('');

  protected readonly categories = computed<CategoryChip[]>(() => {
    const seen = new Map<string, CategoryChip>();
    for (const t of this.treatments()) {
      if (!seen.has(t.categoryId)) {
        seen.set(t.categoryId, { id: t.categoryId, name: t.categoryName, color: t.categoryColor });
      }
    }
    return [...seen.values()];
  });

  protected readonly filtered = computed<Treatment[]>(() => {
    const query = normalize(this.search());
    const category = this.category();
    return this.treatments().filter(
      (t) =>
        (category === '' || t.categoryId === category) &&
        (query === '' || normalize(`${t.name} ${t.categoryName}`).includes(query)),
    );
  });

  /** Solo sin filtros activos — con búsqueda o categoría manda la lista filtrada. */
  protected readonly frequent = computed<Treatment[]>(() => {
    if (this.search().trim() !== '' || this.category() !== '') { return []; }
    const byId = new Map(this.treatments().map((t) => [t.id, t]));
    return this.frequentIds()
      .map((id) => byId.get(id))
      .filter((t): t is Treatment => t !== undefined)
      .slice(0, 6);
  });

  protected readonly selectedTreatmentId = signal('');
  protected readonly selectedTeeth = signal<number[]>([]);

  protected readonly selectedTreatment = computed<Treatment | null>(
    () => this.treatments().find((t) => t.id === this.selectedTreatmentId()) ?? null,
  );

  protected readonly applicationType = computed<TreatmentApplicationType | null>(
    () => this.selectedTreatment()?.applicationType ?? null,
  );

  protected readonly isClickable = computed(
    () =>
      this.applicationType() === 'single_tooth' ||
      this.applicationType() === 'multiple_teeth',
  );

  protected readonly showOdontogram = computed(() => {
    const type = this.applicationType();
    return type !== null && applicationTypeImpliesTeeth(type);
  });

  protected readonly highlightedTeeth = computed(() => {
    const type = this.applicationType();
    return type ? teethForApplicationType(type) : [];
  });

  /**
   * Los dientes que realmente se mandan al backend. Para las arcadas va
   * vacío a propósito — el backend (assertTeethMatchApplicationType) exige
   * que no venga ningún diente en esos tipos y deriva los suyos con su
   * propio teethForApplicationType(); highlightedTeeth() de acá es solo
   * para pintar el odontograma, no para el payload.
   */
  private readonly effectiveToothNumbers = computed<number[]>(() => {
    const type = this.applicationType();
    if (type === 'single_tooth' || type === 'multiple_teeth') {
      return this.selectedTeeth();
    }
    return [];
  });

  protected readonly selectionValid = computed(() => {
    const type = this.applicationType();
    if (!type) { return false; }
    const teeth = this.effectiveToothNumbers();
    if (type === 'single_tooth') { return teeth.length === 1; }
    if (type === 'multiple_teeth') { return teeth.length >= 1; }
    return true;
  });


  constructor() {
    effect(() => {
      const treatment = this.selectedTreatment();
      if (treatment && this.selectionValid()) {
        this.selectionChange.emit({
          treatment,
          toothNumbers: this.effectiveToothNumbers(),
        });
      } else {
        this.selectionChange.emit(null);
      }
    });
  }

  /** Limpia la selección — lo llama el consumidor tras guardar. */
  reset(): void {
    this.selectedTreatmentId.set('');
    this.selectedTeeth.set([]);
    this.search.set('');
  }

  protected onTreatmentChange(id: string): void {
    this.selectedTreatmentId.set(id);
    this.selectedTeeth.set([]);
  }

  /** Los dientes elegidos a mano o, en arcadas y boca completa, los que cubre el tratamiento. */
  protected readonly chartSelectedTeeth = computed<readonly number[]>(() =>
    this.isClickable() ? this.selectedTeeth() : this.highlightedTeeth(),
  );

  protected onToothClick(toothNumber: number): void {
    const type = this.applicationType();
    if (type === 'single_tooth') {
      this.selectedTeeth.set([toothNumber]);
      return;
    }
    if (type === 'multiple_teeth') {
      this.selectedTeeth.update((prev) =>
        prev.includes(toothNumber)
          ? prev.filter((n) => n !== toothNumber)
          : [...prev, toothNumber],
      );
    }
  }
}
