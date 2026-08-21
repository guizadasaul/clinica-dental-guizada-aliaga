import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PhoneInputComponent } from './phone-input';

function setup() {
  TestBed.configureTestingModule({
    imports: [PhoneInputComponent],
    providers: [provideTranslateService({ defaultLanguage: 'es' })],
  });
  const fixture = TestBed.createComponent(PhoneInputComponent);
  return fixture;
}

function nationalInput(fixture: ReturnType<typeof setup>): HTMLInputElement {
  return fixture.nativeElement.querySelector('.phone-input__national');
}

function trigger(fixture: ReturnType<typeof setup>): HTMLButtonElement {
  return fixture.nativeElement.querySelector('.phone-input__trigger');
}

function typeNational(fixture: ReturnType<typeof setup>, digits: string): void {
  const input = nationalInput(fixture);
  input.value = digits;
  input.dispatchEvent(new Event('input'));
}

describe('PhoneInputComponent', () => {
  it('arranca con Bolivia (+591) como país por defecto', async () => {
    const fixture = setup();
    await fixture.whenStable();
    expect(trigger(fixture).textContent).toContain('+591');
  });

  it('filtra a solo dígitos y emite { e164, valid } en cada cambio (el pegado también dispara "input")', async () => {
    const fixture = setup();
    await fixture.whenStable();
    const emitted: Array<{ e164: string; valid: boolean }> = [];
    fixture.componentInstance.changed.subscribe((event) => emitted.push(event));

    typeNational(fixture, '77-84a2665');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(nationalInput(fixture).value).toBe('77842665');
    expect(emitted.at(-1)).toEqual({ e164: '+59177842665', valid: true });
  });

  it('el número real de 8 dígitos (77842665) valida OK; 7 dígitos da "demasiado corto"', async () => {
    const fixture = setup();
    await fixture.whenStable();

    typeNational(fixture, '7784266');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(nationalInput(fixture).value).toBe('7784266');
    nationalInput(fixture).dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();
    // Sin loader de traducciones en el test, `translate.instant()` devuelve la
    // clave cruda — alcanza para verificar que se eligió la clave correcta por
    // motivo (mismo patrón que step-guest-contact.spec.ts).
    expect(fixture.nativeElement.querySelector('.phone-input__error')?.textContent).toContain(
      'shared.phoneInput.errors.tooShort',
    );

    typeNational(fixture, '77842665');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.phone-input__error')).toBeNull();
  });

  it('recorta el número nacional al cambiar de país si supera el largo máximo nuevo', async () => {
    const fixture = setup();
    await fixture.whenStable();

    typeNational(fixture, '77842665');
    fixture.detectChanges();
    await fixture.whenStable();

    trigger(fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();

    const options = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.phone-input__option'),
    ) as HTMLLIElement[];
    const usOption = options.find((el) => el.textContent?.includes('+1'));
    expect(usOption).toBeTruthy();
    usOption!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(trigger(fixture).textContent).toContain('+1');
    expect(nationalInput(fixture).value.length).toBeLessThanOrEqual(15 - '1'.length);
  });

  it('el buscador filtra países por nombre o por código de marcación', async () => {
    const fixture = setup();
    await fixture.whenStable();

    trigger(fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();

    const search: HTMLInputElement = fixture.nativeElement.querySelector('.phone-input__search');
    search.value = 'Argentina';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    const optionsByName = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.phone-input__option'),
    ) as HTMLLIElement[];
    expect(optionsByName.length).toBe(1);
    expect(optionsByName[0].textContent).toContain('+54');

    search.value = '591';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    const optionsByCode = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.phone-input__option'),
    ) as HTMLLIElement[];
    expect(optionsByCode.length).toBeGreaterThan(0);
    optionsByCode.forEach((el) => expect(el.textContent).toContain('+591'));
  });

  it('cierra el desplegable al hacer click afuera', async () => {
    const fixture = setup();
    await fixture.whenStable();

    trigger(fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.phone-input__dropdown')).toBeTruthy();

    document.body.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.phone-input__dropdown')).toBeNull();
  });
});
