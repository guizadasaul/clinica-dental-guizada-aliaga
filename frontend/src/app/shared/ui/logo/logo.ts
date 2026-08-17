import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type LogoTone = 'color' | 'dark' | 'light';

const LOGO_SRC: Record<LogoTone, string> = {
  color: 'assets/images/LogoCuadrado.png',
  dark: 'assets/images/LogoCuadradoNegro.png',
  light: 'assets/images/LogoCuadradoBlanco.png',
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
