import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export interface WorkShowcaseItem {
  readonly id: number;
  readonly icon: string;
  readonly titleKey: string;
  readonly beforeUrl: string;
  readonly beforeAlt: string;
  readonly afterUrl: string;
  readonly afterAlt: string;
}

/**
 * Selector interactivo de casos: fila de paneles que se expanden al click
 * (el resto queda como una franja angosta con solo el ícono). El panel
 * activo muestra la comparación antes/después completa; los demás, solo
 * la foto "después" como preview. Puerto a Angular de un patrón React
 * equivalente — sin animación de entrada propia, reusa el sistema de
 * scroll-reveal (GSAP) ya existente en la landing vía [data-reveal-item].
 */
@Component({
  selector: 'app-work-showcase',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './work-showcase.html',
  styleUrl: './work-showcase.scss',
})
export class WorkShowcaseComponent {
  readonly items = input.required<readonly WorkShowcaseItem[]>();

  protected readonly activeIndex = signal(0);

  protected select(index: number): void {
    this.activeIndex.set(index);
  }
}
