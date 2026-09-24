import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

/**
 * Encabezado único de las pantallas del panel (CLI-111): título en serif,
 * subtítulo opcional, botón "volver" opcional arriba y acciones a la derecha
 * (lo que venga con el atributo `actions`). Sin íconos junto al título, para
 * que todas las secciones sigan la misma línea visual.
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  /** Texto del botón para volver (ej. "Volver a la lista") — sin valor no se muestra. */
  readonly backLabel = input<string | null>(null);
  readonly back = output<void>();

  protected onBack(): void {
    this.back.emit();
  }
}
