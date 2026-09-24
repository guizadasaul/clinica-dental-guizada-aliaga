import { TestBed } from '@angular/core/testing';
import { CatalogPickerComponent, type CatalogPickerItem } from './catalog-picker';

const ITEMS: CatalogPickerItem[] = [
  { id: 'r1', label: 'Restauración simple', groupId: 'op', groupLabel: 'Operatoria dental', color: '#16a34a' },
  { id: 'r2', label: 'Restauración compuesta', groupId: 'op', groupLabel: 'Operatoria dental', color: '#16a34a' },
  { id: 'e1', label: 'Tratamiento de conducto', groupId: 'endo', groupLabel: 'Endodoncia', hint: '1 pieza' },
];

function setup(selectedId: string | null = null) {
  TestBed.configureTestingModule({ imports: [CatalogPickerComponent] });
  const fixture = TestBed.createComponent(CatalogPickerComponent);
  fixture.componentRef.setInput('items', ITEMS);
  fixture.componentRef.setInput('noun', 'tratamiento');
  fixture.componentRef.setInput('selectedId', selectedId);
  fixture.detectChanges();
  const emitted: string[] = [];
  fixture.componentInstance.selectedChange.subscribe((id) => emitted.push(id));
  return { fixture, emitted };
}

function root(fixture: ReturnType<typeof setup>['fixture']): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function optionIds(fixture: ReturnType<typeof setup>['fixture']): string[] {
  return [...root(fixture).querySelectorAll<HTMLElement>('.catalog-picker__option')].map((o) => o.dataset['id']!);
}

function search(fixture: ReturnType<typeof setup>['fixture'], text: string): void {
  const input = root(fixture).querySelector('.catalog-picker__search-input') as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('CatalogPickerComponent', () => {
  it('muestra todas las opciones agrupadas por categoría, con "Todos" y un chip por categoría', () => {
    const { fixture } = setup();

    expect(optionIds(fixture)).toEqual(['r1', 'r2', 'e1']);
    const chips = [...root(fixture).querySelectorAll('.catalog-picker__chip')].map((c) => c.textContent?.trim());
    expect(chips).toEqual(['Todos', 'Operatoria dental', 'Endodoncia']);
    const sections = [...root(fixture).querySelectorAll('.catalog-picker__section')].map((c) => c.textContent?.trim());
    expect(sections).toEqual(['Operatoria dental', 'Endodoncia']);
  });

  it('busca sin importar tildes ni mayúsculas y por varias palabras', () => {
    const { fixture } = setup();

    search(fixture, 'RESTAURACION comp');
    expect(optionIds(fixture)).toEqual(['r2']);

    search(fixture, 'zzz');
    expect(root(fixture).querySelector('.catalog-picker__empty')?.textContent).toContain('zzz');
  });

  it('un chip de categoría filtra a esa categoría', () => {
    const { fixture } = setup();

    (root(fixture).querySelectorAll('.catalog-picker__chip')[2] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(optionIds(fixture)).toEqual(['e1']);
  });

  it('elegir emite el id y colapsa a una fila con "Cambiar"', () => {
    const { fixture, emitted } = setup();

    (root(fixture).querySelector('.catalog-picker__option[data-id="e1"]') as HTMLButtonElement).click();
    fixture.componentRef.setInput('selectedId', 'e1');
    fixture.detectChanges();

    expect(emitted).toEqual(['e1']);
    expect(root(fixture).querySelector('.catalog-picker__selected-label')?.textContent).toContain('Tratamiento de conducto');
    expect(root(fixture).querySelector('.catalog-picker__search-input')).toBeNull();

    (root(fixture).querySelector('.catalog-picker__change') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root(fixture).querySelector('.catalog-picker__search-input')).toBeTruthy();
    expect(root(fixture).querySelector('.catalog-picker__option--selected')?.getAttribute('data-id')).toBe('e1');
  });

  it('con algo ya elegido arranca colapsado', () => {
    const { fixture } = setup('r1');

    expect(root(fixture).querySelector('.catalog-picker__selected-label')?.textContent).toContain('Restauración simple');
  });

  it('flechas y Enter desde el buscador eligen la opción marcada', () => {
    const { fixture, emitted } = setup();
    const input = root(fixture).querySelector('.catalog-picker__search-input') as HTMLInputElement;

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(emitted).toEqual(['r2']);
  });

  it('los atajos (extraGroups) van primero, activos por defecto y en su propio orden', () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('extraGroups', [{ id: 'freq', label: 'Frecuentes', itemIds: ['e1', 'r1', 'no-existe'] }]);
    fixture.detectChanges();

    const chips = [...root(fixture).querySelectorAll('.catalog-picker__chip')].map((c) => c.textContent?.trim());
    expect(chips[0]).toBe('Frecuentes');
    expect(optionIds(fixture)).toEqual(['e1', 'r1']);

    (root(fixture).querySelectorAll('.catalog-picker__chip')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(optionIds(fixture)).toEqual(['r1', 'r2', 'e1']);
  });

  it('un atajo sin ítems existentes no aparece', () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('extraGroups', [{ id: 'freq', label: 'Frecuentes', itemIds: ['no-existe'] }]);
    fixture.detectChanges();

    const chips = [...root(fixture).querySelectorAll('.catalog-picker__chip')].map((c) => c.textContent?.trim());
    expect(chips).not.toContain('Frecuentes');
  });
});
