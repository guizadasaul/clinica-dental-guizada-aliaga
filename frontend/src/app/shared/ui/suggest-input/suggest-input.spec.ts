import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SuggestInputComponent, suggestionKey } from './suggest-input';

@Component({
  standalone: true,
  imports: [SuggestInputComponent],
  template: `
    <app-suggest-input [suggestions]="options">
      <input #suggestField id="field" [value]="value()" (input)="value.set($any($event.target).value)" />
    </app-suggest-input>
  `,
})
class HostComponent {
  readonly options = ['Cochabamba', 'Santa Cruz de la Sierra', 'La Paz', 'Zona Norte'];
  readonly value = signal('');
}

function setup() {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const field = root.querySelector<HTMLInputElement>('#field')!;
  const typeText = (text: string) => {
    field.value = text;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const key = (k: string) => {
    field.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
    fixture.detectChanges();
  };
  const options = () => [...root.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim());
  return { fixture, field, typeText, key, options, host: fixture.componentInstance };
}

describe('suggestionKey', () => {
  it('ignora mayúsculas, tildes y espacios de más', () => {
    expect(suggestionKey('  Cochabámba ')).toBe('cochabamba');
  });
});

describe('SuggestInputComponent (CLI-178)', () => {
  it('convierte el input proyectado en un combobox accesible', () => {
    const { field } = setup();
    expect(field.getAttribute('role')).toBe('combobox');
    expect(field.getAttribute('aria-autocomplete')).toBe('list');
    expect(field.getAttribute('autocomplete')).toBe('off');
    expect(field.getAttribute('aria-expanded')).toBe('false');
  });

  it('al escribir sugiere los valores que coinciden, sin distinguir mayúsculas ni tildes', () => {
    const { typeText, options, field } = setup();
    typeText('COCHABÁ');
    expect(options()).toEqual(['Cochabamba']);
    expect(field.getAttribute('aria-expanded')).toBe('true');

    typeText('la');
    expect(options()).toEqual(['Santa Cruz de la Sierra', 'La Paz']);
  });

  it('al enfocar sin texto muestra las sugerencias más usadas', () => {
    const { field, fixture, options } = setup();
    field.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(options()).toHaveLength(4);
  });

  it('elegir con el mouse escribe el valor en el input y avisa con su evento input', () => {
    const { typeText, fixture, field, host } = setup();
    typeText('coch');
    const option = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[role="option"]')!;
    option.dispatchEvent(new MouseEvent('mousedown', { cancelable: true }));
    fixture.detectChanges();

    expect(field.value).toBe('Cochabamba');
    expect(host.value()).toBe('Cochabamba');
    expect(field.getAttribute('aria-expanded')).toBe('false');
  });

  it('con el teclado: flechas para moverse, Enter para elegir sin enviar el formulario', () => {
    const { typeText, key, field, host, fixture } = setup();
    typeText('a');
    key('ArrowDown');
    key('ArrowDown');
    expect(field.getAttribute('aria-activedescendant')).toMatch(/-1$/);

    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    field.dispatchEvent(enter);
    fixture.detectChanges();
    expect(enter.defaultPrevented).toBe(true);
    expect(host.value()).toBe('Santa Cruz de la Sierra');
  });

  it('Escape cierra la lista y un valor nuevo se acepta tal cual', () => {
    const { typeText, key, options, host } = setup();
    typeText('Villa Nueva');
    expect(options()).toEqual([]);
    expect(host.value()).toBe('Villa Nueva');

    typeText('la');
    key('Escape');
    expect(options()).toEqual([]);
  });

  it('no sugiere el mismo valor que ya está escrito', () => {
    const { typeText, options } = setup();
    typeText('la paz');
    expect(options()).toEqual([]);
  });
});
