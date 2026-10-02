import { TestBed } from '@angular/core/testing';
import {
  TreatmentScopePickerComponent,
  type TreatmentScopeSelection,
} from './treatment-scope-picker';
import type { Treatment } from '../../models/treatment.model';
import type { OdontogramEntry } from '../../../patients/models/patient.model';

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

function setup(
  inputs: { entries?: OdontogramEntry[]; treated?: number[]; frequent?: string[] } = {},
) {
  TestBed.configureTestingModule({ imports: [TreatmentScopePickerComponent] });
  const fixture = TestBed.createComponent(TreatmentScopePickerComponent);
  fixture.componentRef.setInput('treatments', TREATMENTS);
  fixture.componentRef.setInput('odontogramEntries', inputs.entries ?? []);
  fixture.componentRef.setInput('treatedTeeth', inputs.treated ?? []);
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
  const tooth = (n: number) =>
    root.querySelector<HTMLButtonElement>(`.tsp__tooth[aria-label="Diente ${n}"]`)!;
  const click = (n: number) => {
    tooth(n).click();
    fixture.detectChanges();
  };
  const last = () => emitted.at(-1);
  return { fixture, root, emitted, choose, tooth, click, last, cardIds, search, chip };
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
    expect(root.querySelector('.tsp__tooth')).toBeNull();
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
      const { choose, click, last, tooth } = setup();
      choose('uno');
      expect(last()).toBeNull();

      click(16);
      expect(last()).toEqual({ treatment: TREATMENTS[0], toothNumbers: [16] });

      click(26);
      expect(last()?.toothNumbers).toEqual([26]);
      expect(tooth(26).classList).toContain('tsp__tooth--selected');
      expect(tooth(16).classList).not.toContain('tsp__tooth--selected');
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
      const { root, choose, tooth, last } = setup();

      choose('arcada');

      expect(last()).toEqual({ treatment: TREATMENTS[2], toothNumbers: [] });
      expect(tooth(16).disabled).toBe(true);
      expect(tooth(16).classList).toContain('tsp__tooth--selected');
      expect(tooth(46).classList).not.toContain('tsp__tooth--selected');
      expect(root.textContent).toContain('toda la arcada/boca');
    });

    it('los clicks no cambian nada', () => {
      const { fixture, choose, last } = setup();
      choose('arcada');
      const before = last();

      (
        fixture.componentInstance as unknown as { onToothClick(t: { number: number }): void }
      ).onToothClick({ number: 16 });

      expect(last()).toEqual(before);
    });
  });

  describe('colores del odontograma', () => {
    const entry = (toothNumber: number, toothCondition: string) =>
      ({ toothNumber, toothCondition }) as OdontogramEntry;

    function crownFill(root: HTMLElement, n: number): string | null {
      const fills = [...root.querySelectorAll(`.tsp__tooth[aria-label="Diente ${n}"] [fill]`)].map(
        (e) => e.getAttribute('fill'),
      );
      return fills.find((f) => f !== '#e5e7eb' && f !== '#f3f4f6') ?? null;
    }

    function stroke(root: HTMLElement, n: number): string | null {
      return (
        root
          .querySelector(`.tsp__tooth[aria-label="Diente ${n}"] [stroke]`)
          ?.getAttribute('stroke') ?? null
      );
    }

    it('pinta cada diente según su diagnóstico más reciente', () => {
      const { root, choose } = setup({
        entries: [entry(16, 'caries'), entry(16, 'sano'), entry(26, 'desconocido')],
      });
      choose('uno');

      expect(crownFill(root, 16)).toBe('#dc2626');
      expect(crownFill(root, 26)).toBe('#374151');
      expect(crownFill(root, 11)).toBe('white');
    });

    it('borde: elegido > ya tratado > con diagnóstico > sin nada', () => {
      const { root, choose, click } = setup({ entries: [entry(26, 'caries')], treated: [36] });
      choose('varios');
      click(16);

      expect(stroke(root, 16)).toBe('#1a2b5e');
      expect(stroke(root, 36)).toBe('#16a34a');
      expect(stroke(root, 26)).toBe('#6b7280');
      expect(stroke(root, 11)).toBe('#d1d5db');
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
