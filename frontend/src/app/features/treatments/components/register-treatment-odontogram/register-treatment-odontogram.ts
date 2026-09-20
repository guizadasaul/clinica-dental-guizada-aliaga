import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TreatmentsService } from '../../services/treatments.service';
import type { Treatment, ToothProcedure, TreatmentApplicationType, ToothSurfaceCode } from '../../models/treatment.model';
import type { ToothApplicationRequest } from '../../models/treatment.request';
import type { DentalExam } from '../../../patients/models/dental-exam.model';
import type { DiagnosisCategory } from '../../../diagnoses/models/diagnosis.model';
import { OdontogramChartComponent } from '../../../../shared/ui/odontogram-chart/odontogram-chart';
import {
  teethForApplicationType,
  applicationTypeImpliesTeeth,
} from '../../../../shared/constants/dental-chart.constants';
import {
  TOOTH_SURFACE_CODES,
  allowedSurfacesForTooth,
} from '../../../../shared/validation/tooth-surface.validator';

interface TreatmentGroup {
  readonly categoryCode: string;
  readonly categoryName: string;
  readonly treatments: Treatment[];
}

/** Las 7 superficies dentales, por diente (CLI-41/CLI-49) — vista local, no viene del backend tal cual. */
type ToothSurfaces = Record<ToothSurfaceCode, boolean>;

function emptySurfaces(): ToothSurfaces {
  return {
    vestibular: false,
    palatal: false,
    lingual: false,
    mesial: false,
    distal: false,
    occlusal: false,
    incisal: false,
  };
}

const SURFACE_LABELS: Record<ToothSurfaceCode, string> = {
  vestibular: 'Vestibular',
  palatal: 'Palatina',
  lingual: 'Lingual',
  mesial: 'Mesial',
  distal: 'Distal',
  occlusal: 'Oclusal',
  incisal: 'Incisal',
};

/** Lo que emite un guardado exitoso — el padre lo agrega a su lista y muestra el mensaje. */
export interface ProcedureRegisteredEvent {
  readonly procedures: ToothProcedure[];
  readonly message: string;
}

/**
 * Odontograma interactivo para registrar tratamientos (CLI-41) — mismo
 * componente de canvas (`OdontogramChartComponent`) y misma interacción que
 * el flujo de diagnóstico (`StepOdontogramComponent`): el odontograma está
 * visible desde el principio, un clic en un diente abre el panel para ESA
 * pieza (o el botón "Agregar tratamiento" lo abre sin diente), y el
 * tratamiento se elige adentro del panel — no antes.
 *
 * Autocontenido: hace el POST a `tooth-procedures` él mismo (a diferencia de
 * StepOdontogramComponent, que solo arma un borrador local y emite un
 * `submitStep` al final) porque un tratamiento realizado es append-only —
 * se guarda al toque, no hay "borrador" que juntar y mandar junto al final.
 */
@Component({
  selector: 'app-register-treatment-odontogram',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, OdontogramChartComponent],
  templateUrl: './register-treatment-odontogram.html',
  styleUrl: './register-treatment-odontogram.scss',
})
export class RegisterTreatmentOdontogramComponent {
  private readonly treatmentsService = inject(TreatmentsService);

  readonly patientId = input.required<string>();
  readonly treatments = input.required<Treatment[]>();
  /** Catálogo real de diagnósticos (CLI-40) — solo para la leyenda, igual que StepOdontogramComponent. */
  readonly catalog = input<DiagnosisCategory[]>([]);
  /** Última versión del examen dental del paciente — de ahí parte el odontograma (CLI-41). */
  readonly currentExam = input<DentalExam | null>(null);
  readonly procedureRegistered = output<ProcedureRegisteredEvent>();

  // Mismo criterio que StepOdontogramComponent.legendItems: una entrada por
  // categoría del catálogo que tenga al menos un diagnóstico, coloreada con
  // el color de su primer diagnóstico.
  protected readonly legendItems = computed(() =>
    this.catalog()
      .filter((c) => c.diagnoses.length > 0)
      .map((c) => ({ name: c.name, color: c.diagnoses[0].color })),
  );

  // El backend ya devuelve GET /treatments ordenado por categoría y luego
  // por orden dentro de la categoría (ver PrismaTreatmentsRepository) — acá
  // solo se agrupan los consecutivos, sin reordenar.
  protected readonly treatmentGroups = computed<TreatmentGroup[]>(() => {
    const groups: TreatmentGroup[] = [];
    const byCode = new Map<string, TreatmentGroup>();
    for (const t of this.treatments()) {
      let group = byCode.get(t.categoryCode);
      if (!group) {
        group = { categoryCode: t.categoryCode, categoryName: t.categoryName, treatments: [] };
        byCode.set(t.categoryCode, group);
        groups.push(group);
      }
      group.treatments.push(t);
    }
    return groups;
  });

  // Pinta el odontograma con el diagnóstico VIGENTE del paciente — el mismo
  // dato que ve StepOdontogramComponent al abrir "Editar diagnóstico"
  // (findings de currentExam(), no el tooth_condition simplificado de
  // odontogram_entries). Cada finding ya trae su propio toothNumber (los de
  // varios dientes se guardan como una fila por diente, ver DentalExamFinding).
  protected readonly toothColorMap = computed(() => {
    const map = new Map<number, string>();
    for (const f of this.currentExam()?.findings ?? []) {
      if (f.toothNumber !== null && !map.has(f.toothNumber)) {
        map.set(f.toothNumber, f.diagnosisColor);
      }
    }
    return map;
  });

  // ── Panel de nuevo tratamiento ───────────────────────────────────────────
  protected readonly panelOpen = signal(false);
  protected readonly panelTreatmentId = signal('');
  protected readonly panelToothNumbers = signal<number[]>([]);
  /** Superficies por diente — cada diente seleccionado tiene su propio juego (CLI-41). */
  protected readonly panelSurfaces = signal<Map<number, ToothSurfaces>>(new Map());
  protected readonly panelPriceCharged = signal(0);
  protected readonly panelQuantity = signal(1);
  protected readonly panelProcedureDate = signal(new Date().toISOString().substring(0, 10));
  protected readonly panelNotes = signal('');
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly panelTreatment = computed<Treatment | null>(
    () => this.treatments().find((t) => t.id === this.panelTreatmentId()) ?? null,
  );

  protected readonly panelApplicationType = computed<TreatmentApplicationType | null>(
    () => this.panelTreatment()?.applicationType ?? null,
  );

  protected readonly isQuantityBased = computed(
    () => this.panelApplicationType() === 'unit' || this.panelApplicationType() === 'box',
  );

  protected readonly computedTotal = computed(
    () => this.panelQuantity() * (this.panelTreatment()?.basePrice ?? 0),
  );

  /** Dientes resaltados en el odontograma mientras el panel está abierto — arcadas se derivan solas. */
  protected readonly chartSelectedTeeth = computed<number[]>(() => {
    if (!this.panelOpen()) { return []; }
    const type = this.panelApplicationType();
    if (type === 'upper_arch' || type === 'lower_arch' || type === 'full_mouth') {
      return [...teethForApplicationType(type)];
    }
    return this.panelToothNumbers();
  });

  // ── Chart ────────────────────────────────────────────────────────────────

  protected onToothClick(toothNumber: number): void {
    if (this.saving()) { return; }
    if (!this.panelOpen()) {
      this.openPanelForTooth(toothNumber);
      return;
    }
    const type = this.panelApplicationType();
    if (type === 'single_tooth') {
      this.panelToothNumbers.set([toothNumber]);
      this.reconcileSurfaces();
    } else if (type === 'multiple_teeth') {
      this.panelToothNumbers.update((prev) =>
        prev.includes(toothNumber)
          ? prev.filter((n) => n !== toothNumber)
          : [...prev, toothNumber].sort((a, b) => a - b),
      );
      this.reconcileSurfaces();
    }
  }

  // ── Panel ────────────────────────────────────────────────────────────────

  private resetPanelFields(): void {
    this.panelTreatmentId.set('');
    this.panelSurfaces.set(new Map());
    this.panelPriceCharged.set(0);
    this.panelQuantity.set(1);
    this.panelProcedureDate.set(new Date().toISOString().substring(0, 10));
    this.panelNotes.set('');
    this.formError.set(null);
  }

  protected openPanelForTooth(toothNumber: number): void {
    this.resetPanelFields();
    this.panelToothNumbers.set([toothNumber]);
    this.panelOpen.set(true);
  }

  protected onAddTreatmentClick(): void {
    this.resetPanelFields();
    this.panelToothNumbers.set([]);
    this.panelOpen.set(true);
  }

  private reconcileSurfaces(): void {
    const type = this.panelApplicationType();
    if (type !== 'single_tooth' && type !== 'multiple_teeth') {
      this.panelSurfaces.set(new Map());
      return;
    }
    this.panelSurfaces.update((prev) => {
      const next = new Map<number, ToothSurfaces>();
      for (const n of this.panelToothNumbers()) {
        next.set(n, prev.get(n) ?? emptySurfaces());
      }
      return next;
    });
  }

  protected onPanelTreatmentChange(id: string): void {
    this.panelTreatmentId.set(id);
    const treatment = this.treatments().find((t) => t.id === id);
    if (!treatment) { return; }

    this.panelPriceCharged.set(treatment.basePrice);
    this.panelQuantity.set(1);

    const type = treatment.applicationType;
    if (!applicationTypeImpliesTeeth(type)) {
      this.panelToothNumbers.set([]);
    } else if (type === 'single_tooth' && this.panelToothNumbers().length > 1) {
      this.panelToothNumbers.set(this.panelToothNumbers().slice(0, 1));
    }
    this.reconcileSurfaces();
  }

  protected getSurface(toothNumber: number): ToothSurfaces {
    return this.panelSurfaces().get(toothNumber) ?? emptySurfaces();
  }

  protected setSurface(toothNumber: number, key: ToothSurfaceCode, value: boolean): void {
    this.panelSurfaces.update((prev) => {
      const next = new Map(prev);
      next.set(toothNumber, { ...(next.get(toothNumber) ?? emptySurfaces()), [key]: value });
      return next;
    });
  }

  /**
   * Qué checkboxes de superficie mostrar para ESTE diente (CLI-49) — palatal
   * o lingual según arcada, incisal u oclusal según sea incisivo/canino o
   * premolar/molar, nunca las dos alternativas juntas. Mismo criterio que
   * assertValidSurfacesForTooth en el backend.
   */
  protected surfaceOptionsFor(
    toothNumber: number,
  ): { code: ToothSurfaceCode; label: string }[] {
    const allowed = allowedSurfacesForTooth(toothNumber);
    return TOOTH_SURFACE_CODES.filter((code) => allowed.has(code)).map(
      (code) => ({ code, label: SURFACE_LABELS[code] }),
    );
  }

  protected onPanelCancel(): void {
    this.panelOpen.set(false);
    this.formError.set(null);
  }

  /** Los dientes que realmente se mandan al backend — [] para arcadas y tipos sin diente, ver TreatmentApplicationType. */
  private effectiveToothNumbers(): number[] {
    const type = this.panelApplicationType();
    if (type === 'single_tooth' || type === 'multiple_teeth') {
      return this.panelToothNumbers();
    }
    return [];
  }

  protected async onPanelSave(): Promise<void> {
    const treatment = this.panelTreatment();
    if (!treatment) {
      this.formError.set('Elegí un tratamiento.');
      return;
    }

    const teeth = this.effectiveToothNumbers();
    if (treatment.applicationType === 'single_tooth' && teeth.length !== 1) {
      this.formError.set('Este tratamiento requiere exactamente un diente — hacé clic en un diente del odontograma.');
      return;
    }
    if (treatment.applicationType === 'multiple_teeth' && teeth.length < 1) {
      this.formError.set('Este tratamiento requiere al menos un diente — hacé clic en los dientes del odontograma.');
      return;
    }

    const quantityBased = this.isQuantityBased();
    const priceCharged = quantityBased ? this.computedTotal() : this.panelPriceCharged();
    if (!priceCharged || priceCharged <= 0) {
      this.formError.set('El precio cobrado debe ser mayor a 0.');
      return;
    }
    if (quantityBased && this.panelQuantity() < 1) {
      this.formError.set('La cantidad debe ser al menos 1.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const surfaces = this.panelSurfaces();
    const teethPayload: ToothApplicationRequest[] = teeth.map((number) => {
      const s = surfaces.get(number) ?? emptySurfaces();
      return {
        number,
        surfaces: TOOTH_SURFACE_CODES.filter((code) => s[code]),
      };
    });

    try {
      const result = await new Promise<ToothProcedure[]>((resolve, reject) => {
        this.treatmentsService.createToothProcedure(this.patientId(), {
          teeth: teethPayload,
          treatmentId: treatment.id,
          priceCharged,
          quantity: quantityBased ? this.panelQuantity() : undefined,
          procedureDate: this.panelProcedureDate(),
          notes: this.panelNotes().trim() || undefined,
        }).subscribe({ next: resolve, error: reject });
      });

      this.procedureRegistered.emit({
        procedures: result,
        message: this.buildSuccessMessage(treatment, teeth),
      });
      this.panelOpen.set(false);
    } catch {
      this.formError.set('Error al guardar el tratamiento. Intentá de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }

  private buildSuccessMessage(treatment: Treatment, toothNumbers: number[]): string {
    switch (treatment.applicationType) {
      case 'single_tooth':
        return `Tratamiento registrado en diente #${toothNumbers[0]}.`;
      case 'multiple_teeth':
        return `Tratamiento registrado en ${toothNumbers.length} diente${toothNumbers.length === 1 ? '' : 's'}.`;
      case 'upper_arch':
        return 'Tratamiento registrado en la arcada superior.';
      case 'lower_arch':
        return 'Tratamiento registrado en la arcada inferior.';
      case 'full_mouth':
        return 'Tratamiento registrado en toda la boca.';
      default:
        return 'Tratamiento registrado.';
    }
  }
}
