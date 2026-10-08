import { TestBed } from '@angular/core/testing';
import {
  TreatmentScopePickerComponent,
  type TreatmentScopeSelection,
} from './treatment-scope-picker';
import type { Treatment } from '../../models/treatment.model';
import {
  EMPTY_PATIENT_ODONTOGRAM,
  type PatientOdontogram,
} from '../../../../shared/utils/patient-odontogram.util';

function treatment(
  id: string,
  applicationType: string,
  overrides: Partial<Treatment> = {},
): Treatment {
  return {
    id,
    code: id,
    name: `Tratamiento ${id}`,
    description: null,
    basePrice: 100,
    estimatedMinutes: 30,
    applicationType,
    currency: 'BOB',
    basePriceBob: null,
    categoryId: 'cat',
    categoryCode: 'cat',
    categoryName: 'Categoría',
    categoryColor: '#1d4ed8',
    displayOrder: 0,
    ...overrides,
  } as Treatment;
}

const TREATMENTS = [
  treatment('uno', 'single_tooth'),
  treatment('varios', 'multiple_teeth'),
  treatment('arcada', 'upper_arch'),
  treatment('general', 'general'),
  treatment('usd', 'general', { currency: 'USD', basePrice: 50, basePriceBob: 348 }),
  treatment('extraccion', 'single_tooth', {
    name: 'Extracción simple',
    categoryId: 'cirugia',
    categoryName: 'Cirugía',
  }),
];

function setup(inputs: { odontogram?: PatientOdontogram; frequent?: string[] } = {}) {
  TestBed.configureTestingModule({ imports: [TreatmentScopePickerComponent] });
  const fixture = TestBed.createComponent(TreatmentScopePickerComponent);
  fixture.componentRef.setInput('treatments', TREATMENTS);
  fixture.componentRef.setInput('odontogram', inputs.odontogram ?? EMPTY_PATIENT_ODONTOGRAM);
  fixture.componentRef.setInput('frequentIds', inputs.frequent ?? []);
  const emitted: (TreatmentScopeSelection | null)[] = [];
  fixture.componentInstance.selectionChange.subscribe((s) => emitted.push(s));
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const choose = (id: string) => {
    root.querySelector<HTMLButtonElement>(`.tsp__card[data-treatment-id="${id}"]`)!.click();
    fixture.detectChanges();
  };
  const cardIds = (selector = '.tsp__grid') =>
    [...root.querySelectorAll<HTMLElement>(`${selector} .tsp__card`)].map(
      (c) => c.dataset['treatmentId'],
    );
  const search = (text: string) => {
    const input = root.querySelector<HTMLInputElement>('#tsp-search')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const chip = (label: string) => {
    [...root.querySelectorAll<HTMLButtonElement>('.tsp__chip')]
      .find((b) => b.textContent?.trim() === label)!
      .click();
    fixture.detectChanges();
  };
  // CLI-256: el odontograma compartido (el mismo de diagnóstico y tratamientos).
  const tooth = (n: number) =>
    root.querySelector<SVGGElement>(`.odontogram-chart__cell[data-tooth="${n}"]`)!;
  const isSelected = (n: number) => tooth(n).classList.contains('odontogram-chart__cell--selected');
  const click = (n: number) => {
    tooth(n).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
  };
  const last = () => emitted.at(-1);
  return { fixture, root, emitted, choose, tooth, isSelected, click, last, cardIds, search, chip };
}

describe('TreatmentScopePickerComponent', () => {
  it('sin tratamiento elegido no emite selección y pide elegir uno', () => {
    const { root, last } = setup();

    expect(last()).toBeNull();
    expect(root.textContent).toContain('Elige un tratamiento del catálogo para continuar');
  });

  it('un tratamiento general es válido sin piezas y no muestra el odontograma', () => {
    const { root, choose, last } = setup();

    choose('general');

    expect(last()).toEqual({ treatment: TREATMENTS[3], toothNumbers: [] });
    expect(root.querySelector('app-odontogram-chart')).toBeNull();
  });

  it('un tratamiento en dólares muestra su equivalente aproximado en Bs.', () => {
    const { root, choose } = setup();

    choose('usd');

    expect(root.querySelector('.tsp__fx-hint')?.textContent).toContain('348.00');
  });

  describe('catálogo (CLI-157)', () => {
    it('muestra todos los tratamientos como tarjetas', () => {
      const { cardIds } = setup();

      expect(cardIds()).toEqual(TREATMENTS.map((t) => t.id));
    });

    it('buscar filtra por nombre sin importar tildes ni mayúsculas', () => {
      const { root, search, cardIds } = setup();

      search('EXTRACCION');
      expect(cardIds()).toEqual(['extraccion']);

      search('no existe');
      expect(root.textContent).toContain('No hay tratamientos que coincidan');
    });

    it('buscar también encuentra por categoría', () => {
      const { search, cardIds } = setup();

      search('cirug');

      expect(cardIds()).toEqual(['extraccion']);
    });

    it('los chips filtran por categoría y "Todas" vuelve al catálogo completo', () => {
      const { chip, cardIds } = setup();

      chip('Cirugía');
      expect(cardIds()).toEqual(['extraccion']);

      chip('Todas');
      expect(cardIds()).toHaveLength(TREATMENTS.length);
    });

    it('los frecuentes van arriba y se ocultan al filtrar', () => {
      const { root, search } = setup({ frequent: ['general', 'borrado', 'uno'] });

      const first = root.querySelector('.tsp__grid')!;
      expect(
        [...first.querySelectorAll<HTMLElement>('.tsp__card')].map((c) => c.dataset['treatmentId']),
      ).toEqual(['general', 'uno']);
      expect(root.textContent).toContain('Frecuentes');

      search('uno');
      expect(root.textContent).not.toContain('Frecuentes');
    });

    it('elegir colapsa el catálogo y "Cambiar" lo vuelve a abrir', () => {
      const { root, choose, last, fixture } = setup();

      choose('general');
      expect(root.querySelector('.tsp__catalog')).toBeNull();
      expect(root.querySelector('.tsp__chosen')?.textContent).toContain('Tratamiento general');

      root.querySelector<HTMLButtonElement>('.tsp__chosen-change')!.click();
      fixture.detectChanges();

      expect(root.querySelector('.tsp__catalog')).not.toBeNull();
      expect(last()).toBeNull();
    });
  });

  describe('una pieza', () => {
    it('hasta elegir el diente no hay selección válida; elegir otro lo reemplaza', () => {
      const { choose, click, last, isSelected } = setup();
      choose('uno');
      expect(last()).toBeNull();

      click(16);
      expect(last()).toEqual({ treatment: TREATMENTS[0], toothNumbers: [16] });

      click(26);
      expect(last()?.toothNumbers).toEqual([26]);
      expect(isSelected(26)).toBe(true);
      expect(isSelected(16)).toBe(false);
    });

    it('también se puede elegir un diente de leche (CLI-180)', () => {
      const { choose, click, last } = setup();
      choose('uno');

      click(54);

      expect(last()?.toothNumbers).toEqual([54]);
    });
  });

  describe('varias piezas', () => {
    it('cada click agrega o quita un diente, y contarlos lo refleja', () => {
      const { root, choose, click, last } = setup();
      choose('varios');

      click(16);
      click(17);
      expect(last()?.toothNumbers).toEqual([16, 17]);
      expect(root.textContent).toContain('2 seleccionados');

      click(16);
      expect(last()?.toothNumbers).toEqual([17]);
      expect(root.textContent).toContain('1 seleccionado)');

      click(17);
      expect(last()).toBeNull();
    });

    it('cambiar de tratamiento borra los dientes elegidos', () => {
      const { root, fixture, choose, click, last } = setup();
      choose('varios');
      click(16);

      root.querySelector<HTMLButtonElement>('.tsp__chosen-change')!.click();
      fixture.detectChanges();
      choose('uno');

      expect(last()).toBeNull();
    });
  });

  describe('arcada', () => {
    it('resalta toda la arcada sin selección manual y no manda dientes (los deriva el backend)', () => {
      const { root, choose, tooth, isSelected, last } = setup();

      choose('arcada');

      expect(last()).toEqual({ treatment: TREATMENTS[2], toothNumbers: [] });
      // No se toca: el odontograma no es interactivo.
      expect(tooth(16).getAttribute('role')).toBeNull();
      expect(isSelected(16)).toBe(true);
      expect(isSelected(46)).toBe(false);
      expect(root.textContent).toContain('toda la arcada/boca');
    });

    it('la arcada no resalta los dientes de leche, como la registra la API', () => {
      const { choose, isSelected } = setup();

      choose('arcada');

      expect(isSelected(54)).toBe(false);
    });

    it('los clicks no cambian nada', () => {
      const { choose, click, last } = setup();
      choose('arcada');
      const before = last();

      click(16);

      expect(last()).toEqual(before);
    });
  });

  describe('odontograma del paciente (CLI-256)', () => {
    it('es el odontograma compartido de diagnóstico y tratamientos, con los colores del paciente', () => {
      const { root, choose } = setup({
        odontogram: {
          toothColor: new Map([[16, '#dc2626']]),
          toothNames: new Map([[16, ['Caries']]]),
          treatedTeeth: [36],
          legendItems: [{ name: 'Caries', color: '#dc2626', group: 'Diagnósticos' }],
        },
      });
      choose('uno');

      expect(root.querySelector('app-odontogram-chart')).not.toBeNull();
      const paint = root.querySelector('.odontogram-chart__cell[data-tooth="16"] .odontogram-chart__cell-shape');
      expect(paint?.getAttribute('fill')).toBe('#dc2626');
      expect(root.textContent).toContain('Caries');
      // Ya no existe el dibujo viejo de dientes cuadrados.
      expect(root.querySelector('.tsp__tooth, .tsp__arch')).toBeNull();
    });
  });

  it('reset() limpia la selección para cargar otra línea', () => {
    const { fixture, choose, click, last } = setup();
    choose('uno');
    click(16);

    fixture.componentInstance.reset();
    fixture.detectChanges();

    expect(last()).toBeNull();
  });
});
