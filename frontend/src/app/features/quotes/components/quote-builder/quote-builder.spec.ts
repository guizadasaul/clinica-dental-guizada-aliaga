import { Component, forwardRef, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { of, throwError, type Observable } from 'rxjs';
import { QuoteBuilderComponent } from './quote-builder';
import { QuotesService } from '../../services/quotes.service';
import { TreatmentsService } from '../../../treatments/services/treatments.service';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';
import type { Quote, QuoteItem } from '../../models/quote.model';
import type { Treatment } from '../../../treatments/models/treatment.model';
import {
  TreatmentScopePickerComponent,
  type TreatmentScopeSelection,
} from '../../../treatments/components/treatment-scope-picker/treatment-scope-picker';

// El selector de tratamiento/piezas tiene su propio spec.
// Se registra con el token del componente real para que el viewChild del presupuesto lo encuentre.
@Component({
  selector: 'app-treatment-scope-picker',
  standalone: true,
  template: 'selector',
  providers: [
    { provide: TreatmentScopePickerComponent, useExisting: forwardRef(() => ScopePickerStub) },
  ],
})
class ScopePickerStub {
  readonly treatments = input<Treatment[]>([]);
  readonly frequentIds = input<string[]>([]);
  readonly selectionChange = output<TreatmentScopeSelection | null>();
  readonly reset = vi.fn();
}

function treatment(overrides: Partial<Treatment> = {}): Treatment {
  return {
    id: 'treatment-1',
    code: 'resina',
    name: 'Resina',
    description: null,
    basePrice: 150,
    estimatedMinutes: 30,
    applicationType: 'single_tooth',
    currency: 'BOB',
    basePriceBob: null,
    categoryId: 'cat-1',
    categoryCode: 'restauracion',
    categoryName: 'Restauración',
    categoryColor: '#1d4ed8',
    displayOrder: 0,
    isActive: true,
    ...overrides,
  } as Treatment;
}

function item(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: 'item-1',
    quoteId: 'quote-1',
    treatmentId: 'treatment-1',
    treatmentName: 'Resina',
    toothNumber: 16,
    applicationGroupId: null,
    unitPrice: 150,
    quantity: 1,
    subtotal: 150,
    currency: 'BOB',
    exchangeRate: null,
    ...overrides,
  };
}

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-1',
    patientId: 'patient-1',
    totalAmount: 0,
    totalPaid: 0,
    balance: 0,
    status: 'pending',
    notes: null,
    createdAt: '2026-09-24T00:00:00Z',
    updatedAt: '2026-09-24T00:00:00Z',
    sharedAt: null,
    items: [],
    payments: [],
    lines: [],
    ...overrides,
  };
}

function setup(
  existing: Quote[] = [quote()],
  frequent: Observable<string[]> = of(['treatment-2']),
) {
  const quotes = {
    getByPatient: vi.fn().mockReturnValue(of(existing)),
    createForPatient: vi.fn().mockReturnValue(of(quote({ id: 'quote-new' }))),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    share: vi.fn(),
  };
  const treatments = {
    getFrequentIds: vi.fn().mockReturnValue(frequent),
    getAll: vi
      .fn()
      .mockReturnValue(
        of([
          treatment(),
          treatment({
            id: 'treatment-2',
            name: 'Blanqueamiento',
            applicationType: 'full_mouth',
            currency: 'USD',
          }),
        ]),
      ),
  };
  TestBed.configureTestingModule({
    imports: [QuoteBuilderComponent],
    providers: [
      { provide: QuotesService, useValue: quotes },
      { provide: TreatmentsService, useValue: treatments },
    ],
  });
  TestBed.overrideComponent(QuoteBuilderComponent, {
    set: { imports: [PageHeaderComponent, DecimalPipe, FormsModule, ScopePickerStub] },
  });
  const fixture = TestBed.createComponent(QuoteBuilderComponent);
  fixture.componentRef.setInput('patientId', 'patient-1');
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, quotes };
}

async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

function picker(fixture: ReturnType<typeof setup>['fixture']): ScopePickerStub {
  return fixture.debugElement.query(By.directive(ScopePickerStub))
    .componentInstance as ScopePickerStub;
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(label),
  )!;
}

function type(root: HTMLElement, id: string, value: string): void {
  const el = root.querySelector<HTMLInputElement>(`#${id}`)!;
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

describe('QuoteBuilderComponent', () => {
  describe('carga', () => {
    it('retoma el presupuesto abierto del paciente (pendiente o con pagos parciales)', () => {
      const { root, quotes } = setup([
        quote({ id: 'viejo', status: 'paid' }),
        quote({ id: 'abierto', status: 'partially_paid' }),
      ]);

      expect(quotes.createForPatient).not.toHaveBeenCalled();
      expect(root.textContent).toContain('Todavía no agregaste tratamientos');
    });

    it('si no tiene uno abierto, crea uno nuevo', () => {
      const { quotes } = setup([quote({ status: 'paid' })]);

      expect(quotes.createForPatient).toHaveBeenCalledWith('patient-1');
    });

    it.each([
      ['la lista', 'getByPatient'],
      ['la creación', 'createForPatient'],
    ] as const)('si falla %s, muestra el error', (_, method) => {
      TestBed.resetTestingModule();
      const quotes = {
        getByPatient: vi
          .fn()
          .mockReturnValue(method === 'getByPatient' ? throwError(() => new Error('500')) : of([])),
        createForPatient: vi.fn().mockReturnValue(throwError(() => new Error('500'))),
      };
      TestBed.configureTestingModule({
        imports: [QuoteBuilderComponent],
        providers: [
          { provide: QuotesService, useValue: quotes },
          { provide: TreatmentsService, useValue: { getAll: () => of([]), getFrequentIds: () => of([]) } },
        ],
      });
      const fixture = TestBed.createComponent(QuoteBuilderComponent);
      fixture.componentRef.setInput('patientId', 'patient-1');
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'No se pudo cargar el presupuesto',
      );
    });
  });

  describe('líneas', () => {
    it('agrupa las filas de un mismo grupo en una línea con todas sus piezas', () => {
      const { root } = setup([
        quote({
          items: [
            item({ id: 'a', toothNumber: 16, applicationGroupId: 'g1', subtotal: 300 }),
            item({ id: 'b', toothNumber: 17, applicationGroupId: 'g1', subtotal: 300 }),
            item({
              id: 'c',
              toothNumber: null,
              treatmentId: 'treatment-2',
              treatmentName: 'Blanqueamiento',
            }),
          ],
        }),
      ]);

      const rows = root.querySelectorAll('.qb__line');
      expect(rows[0].textContent).toContain('#16');
      expect(rows[0].textContent).toContain('#17');
      expect(rows[0].textContent).toContain('Resina');
      expect(rows[1].textContent).toContain('Blanqueamiento');
    });

    it('una línea en dólares muestra también su equivalente en USD', () => {
      const { root } = setup([
        quote({ items: [item({ currency: 'USD', exchangeRate: 6.96, subtotal: 696 })] }),
      ]);

      expect(root.querySelector('.qb__fx-hint')?.textContent).toContain('100.00');
    });

    it('el nombre de la línea viene del presupuesto, aunque el tratamiento ya no esté en el catálogo', () => {
      const { root } = setup([
        quote({ items: [item({ treatmentId: 'borrado', treatmentName: 'Tratamiento viejo' })] }),
      ]);

      expect(root.querySelector('.qb__line')?.textContent).toContain('Tratamiento viejo');
    });

    it('quitar una línea actualiza el presupuesto', async () => {
      const { fixture, root, quotes } = setup([quote({ items: [item()] })]);
      quotes.removeItem.mockReturnValue(of(quote()));

      root.querySelector<HTMLButtonElement>('.qb__remove-btn')!.click();
      await settle(fixture);

      expect(quotes.removeItem).toHaveBeenCalledWith('quote-1', 'item-1');
      expect(root.textContent).toContain('Todavía no agregaste tratamientos');
    });

    // Ojo: formError solo se pinta dentro del panel de "agregar línea"; si está cerrado,
    // el usuario no ve este error (reportado aparte, fuera del alcance de CLI-121).
    it('si quitar falla, deja el error y la línea sigue ahí', async () => {
      const { fixture, root, quotes } = setup([quote({ items: [item()] })]);
      quotes.removeItem.mockReturnValue(throwError(() => new Error('500')));

      root.querySelector<HTMLButtonElement>('.qb__remove-btn')!.click();
      await settle(fixture);

      expect(
        (fixture.componentInstance as unknown as { formError(): string | null }).formError(),
      ).toContain('No se pudo eliminar la línea');
      expect(root.querySelector('.qb__remove-btn')).not.toBeNull();
    });
  });

  describe('agregar línea', () => {
    function select(
      fixture: ReturnType<typeof setup>['fixture'],
      t: Treatment,
      toothNumbers: number[] = [16],
    ): void {
      picker(fixture).selectionChange.emit({ treatment: t, toothNumbers });
      fixture.detectChanges();
    }

    it('elegir tratamiento abre el panel; por pieza no pide cantidad', () => {
      const { fixture, root } = setup();

      select(fixture, treatment());

      expect(root.querySelector('.qb__panel')).not.toBeNull();
      expect(root.querySelector('#quantity')).toBeNull();
    });

    it('agrega con precio personalizado y resetea el selector', async () => {
      const { fixture, root, quotes } = setup();
      quotes.addItem.mockReturnValue(of(quote({ items: [item()] })));
      select(fixture, treatment());
      type(root, 'customPrice', '120');
      await settle(fixture);

      button(root, 'Agregar al presupuesto').click();
      await settle(fixture);

      expect(quotes.addItem).toHaveBeenCalledWith('quote-1', {
        treatmentId: 'treatment-1',
        toothNumbers: [16],
        customPrice: 120,
        quantity: undefined,
      });
      expect(picker(fixture).reset).toHaveBeenCalled();
      expect(root.querySelector('.qb__panel')).toBeNull();
    });

    it('un tratamiento sin piezas se cobra por cantidad', async () => {
      const { fixture, root, quotes } = setup();
      quotes.addItem.mockReturnValue(of(quote()));
      select(fixture, treatment({ applicationType: 'general' }), []);
      type(root, 'quantity', '3');
      await settle(fixture);

      button(root, 'Agregar al presupuesto').click();
      await settle(fixture);

      expect(quotes.addItem).toHaveBeenCalledWith(
        'quote-1',
        expect.objectContaining({ quantity: 3, customPrice: undefined }),
      );
    });

    it('si falla, avisa y deja el panel abierto', async () => {
      const { fixture, root, quotes } = setup();
      quotes.addItem.mockReturnValue(throwError(() => new Error('400')));
      select(fixture, treatment());

      button(root, 'Agregar al presupuesto').click();
      await settle(fixture);

      expect(root.textContent).toContain('No se pudo agregar la línea');
      expect(root.querySelector('.qb__panel')).not.toBeNull();
    });

    it('deseleccionar cierra el panel', () => {
      const { fixture, root } = setup();
      select(fixture, treatment());

      picker(fixture).selectionChange.emit(null);
      fixture.detectChanges();

      expect(root.querySelector('.qb__panel')).toBeNull();
    });
  });

  describe('frecuentes', () => {
    it('le pasa al catálogo los tratamientos frecuentes del doctor', () => {
      const { fixture } = setup();

      expect(picker(fixture).frequentIds()).toEqual(['treatment-2']);
    });

    it('si los frecuentes fallan, el catálogo sigue sin esa sección', () => {
      const { fixture } = setup([quote()], throwError(() => new Error('500')));

      expect(picker(fixture).frequentIds()).toEqual([]);
    });
  });

  describe('guardar y compartir (CLI-156)', () => {
    it('un borrador muestra el badge y el botón; sin líneas no se puede compartir', () => {
      const { root } = setup();

      expect(root.querySelector('.qb__badge')?.textContent).toContain('Borrador');
      expect(button(root, 'Guardar y compartir').disabled).toBe(true);
    });

    it('compartir marca el presupuesto como visible para el paciente', async () => {
      const { fixture, root, quotes } = setup([quote({ items: [item()], totalAmount: 150 })]);
      quotes.share.mockReturnValue(
        of(quote({ items: [item()], totalAmount: 150, sharedAt: '2026-09-27T00:00:00Z' })),
      );

      button(root, 'Guardar y compartir').click();
      await settle(fixture);

      expect(quotes.share).toHaveBeenCalledWith('quote-1');
      expect(root.querySelector('.qb__badge--shared')).not.toBeNull();
      expect(button(root, 'Guardar y compartir')).toBeUndefined();
      expect(root.textContent).toContain('El paciente ve este presupuesto');
    });

    it('si compartir falla, avisa y sigue como borrador', async () => {
      const { fixture, root, quotes } = setup([quote({ items: [item()] })]);
      quotes.share.mockReturnValue(throwError(() => new Error('500')));

      button(root, 'Guardar y compartir').click();
      await settle(fixture);

      expect(root.textContent).toContain('No se pudo compartir el presupuesto');
      expect(root.querySelector('.qb__badge--shared')).toBeNull();
    });

    it('con pagos muestra pagado y saldo', () => {
      const { root } = setup([
        quote({ items: [item()], totalAmount: 300, totalPaid: 100, balance: 200 }),
      ]);

      expect(root.querySelector('.qb__totals')?.textContent).toContain('Bs. 200.00');
    });
  });

  it('volver cierra el presupuesto', () => {
    const { fixture, root } = setup();
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);

    root.querySelector<HTMLButtonElement>('app-page-header button')!.click();

    expect(closed).toBe(1);
  });
});
