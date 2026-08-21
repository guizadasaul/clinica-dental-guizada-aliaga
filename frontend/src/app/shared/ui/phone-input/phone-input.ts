import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import parsePhoneNumberFromString, { getCountries, getExampleNumber, type CountryCode } from 'libphonenumber-js';
import examples from 'libphonenumber-js/examples.mobile.json';
import { DEFAULT_COUNTRY, PRIORITY_COUNTRIES, callingCodeFor, toE164, validateNationalPhone } from '../../validation/phone.validator';

interface CountryOption {
  readonly code: CountryCode;
  readonly callingCode: string;
  readonly name: string;
  readonly flag: string;
}

/** Bandera a partir del código ISO-3166 alpha-2: cada letra se mapea a su "regional
 * indicator symbol" (U+1F1E6 = 🇦 arranca en 'A' = 65, offset 127397). */
function countryFlag(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((char) => 127397 + char.charCodeAt(0)));
}

const ALL_COUNTRY_CODES = getCountries();

/**
 * Selector de teléfono internacional. Sin `ControlValueAccessor` (no se usa en este
 * repo) — API a la `input()`/`output()`: `value` es el E.164 inicial/externo,
 * `changed` emite `{ e164, valid }` en cada cambio. El texto propio del componente
 * (buscador, hint, mensajes de largo) vive bajo el árbol `shared.phoneInput.*` de
 * i18n — es un componente de `shared/ui/`, no pertenece a `landing.booking` aunque
 * hoy solo lo use `step-guest-contact`.
 */
@Component({
  selector: 'app-phone-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './phone-input.html',
  styleUrl: './phone-input.scss',
})
export class PhoneInputComponent {
  readonly value = input('');
  readonly disabled = input(false);
  readonly changed = output<{ e164: string; valid: boolean }>();

  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  /** Último E.164 que este componente emitió — permite distinguir un `value()`
   * entrante genuinamente externo (hay que parsearlo) de la simple eco de lo que
   * el propio componente acaba de emitir (el padre lo reflejó de vuelta por `[value]`). */
  private lastEmitted = '';

  protected readonly open = signal(false);
  protected readonly search = signal('');
  protected readonly country = signal<CountryCode>(DEFAULT_COUNTRY);
  protected readonly national = signal('');
  protected readonly touched = signal(false);
  protected readonly lang = signal(this.translate.currentLang || this.translate.getDefaultLang() || 'es');

  protected readonly callingCode = computed(() => callingCodeFor(this.country()));
  protected readonly maxNationalLength = computed(() => Math.max(1, 15 - this.callingCode().length));
  protected readonly e164 = computed(() => toE164(this.callingCode(), this.national()));
  protected readonly nationalValidation = computed(() => validateNationalPhone(this.national(), this.country()));
  protected readonly valid = computed(() => this.nationalValidation().valid);

  protected readonly errorMessage = computed(() => {
    this.lang(); // dependencia reactiva: recalcular el mensaje si cambia el idioma
    if (!this.touched() || !this.national() || this.valid()) return null;
    const issue = this.nationalValidation().lengthIssue;
    if (issue === 'TOO_SHORT') return this.translate.instant('shared.phoneInput.errors.tooShort');
    if (issue === 'TOO_LONG') return this.translate.instant('shared.phoneInput.errors.tooLong');
    return this.translate.instant('shared.phoneInput.errors.invalid');
  });

  protected readonly exampleHint = computed(() => {
    this.lang(); // dependencia reactiva: recalcular el hint si cambia el idioma
    const example = getExampleNumber(this.country(), examples);
    if (!example) return '';
    const digits = example.nationalNumber;
    return this.translate.instant('shared.phoneInput.exampleHint', {
      number: digits,
      count: digits.length,
    });
  });

  protected readonly countryOptions = computed<CountryOption[]>(() => {
    const lang = this.lang();
    const displayNames = new Intl.DisplayNames([lang], { type: 'region' });
    const toOption = (code: CountryCode): CountryOption => ({
      code,
      callingCode: callingCodeFor(code),
      name: displayNames.of(code) ?? code,
      flag: countryFlag(code),
    });
    const prioritySet = new Set<CountryCode>(PRIORITY_COUNTRIES);
    const priority = PRIORITY_COUNTRIES.map(toOption);
    const rest = ALL_COUNTRY_CODES.filter((code) => !prioritySet.has(code))
      .map(toOption)
      .sort((a, b) => a.name.localeCompare(b.name, lang));
    return [...priority, ...rest];
  });

  protected readonly filteredCountries = computed<CountryOption[]>(() => {
    const term = this.search().trim().toLowerCase().replace(/^\+/, '');
    if (!term) return this.countryOptions();
    return this.countryOptions().filter(
      (option) => option.name.toLowerCase().includes(term) || option.callingCode.includes(term),
    );
  });

  protected readonly selectedCountry = computed<CountryOption>(() => {
    const options = this.countryOptions();
    return options.find((option) => option.code === this.country()) ?? options[0];
  });

  constructor() {
    const langSub = this.translate.onLangChange.subscribe((event) => this.lang.set(event.lang));
    this.destroyRef.onDestroy(() => langSub.unsubscribe());

    // Sincroniza con un `value()` que cambió por fuera del componente (ej. el padre
    // precarga un teléfono guardado). Si el valor entrante es el mismo que este
    // componente acaba de emitir, no hace nada — evita pelearse con lo que el
    // usuario está tipeando cuando el padre solo refleja el output de vuelta.
    effect(() => {
      const incoming = this.value();
      if (incoming === this.lastEmitted) {
        return;
      }
      this.lastEmitted = incoming;
      if (!incoming) {
        this.national.set('');
        return;
      }
      const parsed = parsePhoneNumberFromString(incoming);
      if (parsed?.country) {
        this.country.set(parsed.country);
        this.national.set(parsed.nationalNumber);
      }
    }, { allowSignalWrites: true });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.phone-input')) {
      this.open.set(false);
    }
  }

  protected toggle(): void {
    if (this.disabled()) return;
    this.open.update((v) => !v);
    if (this.open()) {
      this.search.set('');
    }
  }

  protected selectCountry(code: CountryCode): void {
    this.country.set(code);
    this.open.set(false);
    this.search.set('');
    const max = this.maxNationalLength();
    if (this.national().length > max) {
      this.national.set(this.national().slice(0, max));
    }
    this.touched.set(true);
    this.emitChange();
  }

  protected onNationalInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const digits = raw.replace(/\D/g, '').slice(0, this.maxNationalLength());
    this.national.set(digits);
    this.touched.set(true);
    this.emitChange();
  }

  protected onBlur(): void {
    this.touched.set(true);
  }

  private emitChange(): void {
    const e164 = this.e164();
    this.lastEmitted = e164;
    this.changed.emit({ e164, valid: this.valid() });
  }
}
