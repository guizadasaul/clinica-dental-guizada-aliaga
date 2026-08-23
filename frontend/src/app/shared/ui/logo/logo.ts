import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type LogoTone = 'color' | 'dark' | 'light' | 'light-full';

const LOGO_SRC: Record<LogoTone, string> = {
  color: 'assets/images/ClinicaIcono.png',
  dark: 'assets/images/LogoCuadradoNegroSinLetra.png',
  light: 'assets/images/LogoCuadradoBlancoSinLetra.png',
  'light-full': 'assets/images/LogoHorizontalBlanco.png',
};

@Component({
  selector: 'app-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './logo.html',
  styleUrl: './logo.scss',
})
export class LogoComponent {
  readonly tone = input<LogoTone>('color');

  protected readonly src = computed(() => LOGO_SRC[this.tone()]);
}
