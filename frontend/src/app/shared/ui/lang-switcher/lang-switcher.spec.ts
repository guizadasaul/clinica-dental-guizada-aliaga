import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { LangSwitcherComponent } from './lang-switcher';

// Montado dentro de un host, como en la app: el componente reconoce los clicks
// propios buscando su etiqueta <app-lang-switcher>.
@Component({
  standalone: true,
  imports: [LangSwitcherComponent],
  template: '<app-lang-switcher />',
})
class HostComponent {}

function setup(current?: string) {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [provideTranslateService({ defaultLanguage: 'es' })],
  });
  const translate = TestBed.inject(TranslateService);
  if (current) {
    translate.use(current);
  }
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const toggle = () => {
    root.querySelector<HTMLButtonElement>('.lang-switcher__trigger')!.click();
    fixture.detectChanges();
  };
  return { fixture, root, translate, toggle };
}

describe('LangSwitcherComponent', () => {
  it('muestra el idioma actual y abre la lista de idiomas como botones', () => {
    const { root, toggle } = setup('en');

    expect(root.querySelector('.lang-switcher__code')?.textContent).toBe('EN');
    expect(root.querySelector('.lang-switcher__trigger')?.getAttribute('aria-expanded')).toBe('false');

    toggle();

    const options = root.querySelectorAll<HTMLButtonElement>('button.lang-switcher__option');
    expect(options).toHaveLength(3);
    expect(root.querySelector('.lang-switcher__trigger')?.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('.lang-switcher__option--active')?.getAttribute('aria-current')).toBe('true');
    expect(root.querySelector('.lang-switcher__option--active')?.textContent).toContain('English');
  });

  it('elegir un idioma lo aplica y cierra la lista', () => {
    const { fixture, root, translate, toggle } = setup();
    const use = vi.spyOn(translate, 'use');
    toggle();

    root.querySelectorAll<HTMLButtonElement>('button.lang-switcher__option')[2].click();
    fixture.detectChanges();

    expect(use).toHaveBeenCalledWith('pt');
    expect(root.querySelector('.lang-switcher__code')?.textContent).toBe('PT');
    expect(root.querySelector('.lang-switcher__dropdown')).toBeNull();
  });

  it('sin idioma activo arranca en español', () => {
    const { root } = setup();

    expect(root.querySelector('.lang-switcher__code')?.textContent).toBe('ES');
  });

  it('un click fuera del selector cierra la lista; uno adentro, no', () => {
    const { fixture, root, toggle } = setup();
    toggle();

    root.querySelector('.lang-switcher__dropdown')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('.lang-switcher__dropdown')).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('.lang-switcher__dropdown')).toBeNull();
  });
});
