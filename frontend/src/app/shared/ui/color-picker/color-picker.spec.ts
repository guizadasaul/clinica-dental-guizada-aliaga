import { TestBed } from '@angular/core/testing';
import { ColorPickerComponent } from './color-picker';
import { DOCTOR_COLOR_PALETTE } from '../../constants/doctor-colors';

function setup(value = '#2563eb') {
  TestBed.configureTestingModule({ imports: [ColorPickerComponent] });
  const fixture = TestBed.createComponent(ColorPickerComponent);
  fixture.componentRef.setInput('value', value);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('ColorPickerComponent (CLI-191)', () => {
  it('muestra la paleta y marca el color actual', () => {
    const { root } = setup('#16a34a');

    const swatches = root.querySelectorAll<HTMLButtonElement>('.color-picker__swatch');
    expect(swatches).toHaveLength(DOCTOR_COLOR_PALETTE.length);
    const active = root.querySelectorAll('.color-picker__swatch--active');
    expect(active).toHaveLength(1);
    expect((active[0] as HTMLElement).getAttribute('aria-pressed')).toBe('true');
  });

  it('elegir un color de la paleta lo emite en minúsculas', () => {
    const { fixture, root } = setup();

    root.querySelectorAll<HTMLButtonElement>('.color-picker__swatch')[2].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe(DOCTOR_COLOR_PALETTE[2]);
  });

  it('el selector libre acepta otro color y lo normaliza a minúsculas', () => {
    const { fixture, root } = setup();
    const custom = root.querySelector<HTMLInputElement>('.color-picker__custom')!;

    custom.value = '#ABCDEF';
    custom.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('#abcdef');
  });
});
