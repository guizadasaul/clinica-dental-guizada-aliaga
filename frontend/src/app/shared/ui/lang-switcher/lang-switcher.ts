import {
  Component,
  ChangeDetectionStrategy,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

interface Language {
  readonly code: string;
  readonly label: string;
  readonly flag: string;
}

const LANGUAGES: Language[] = [
  { code: 'es', label: 'Español', flag: '🇧🇴' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
];

@Component({
  selector: 'app-lang-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lang-switcher.html',
  styleUrl: './lang-switcher.scss',
})
export class LangSwitcherComponent {
  private readonly translate = inject(TranslateService);

  protected readonly languages = LANGUAGES;
  protected readonly open = signal(false);
  protected readonly currentLang = signal(this.translate.getCurrentLang() || 'es');

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('app-lang-switcher')) {
      this.open.set(false);
    }
  }

  protected toggle(): void {
    this.open.update(v => !v);
  }

  protected selectLang(code: string): void {
    this.translate.use(code);
    this.currentLang.set(code);
    this.open.set(false);
  }

  protected getCurrent(): Language {
    return LANGUAGES.find(l => l.code === this.currentLang()) ?? LANGUAGES[0];
  }
}
