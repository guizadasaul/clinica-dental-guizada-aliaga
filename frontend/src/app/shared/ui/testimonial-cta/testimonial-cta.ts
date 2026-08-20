import { ChangeDetectionStrategy, Component, HostListener, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TestimonialFormComponent } from '../testimonial-form/testimonial-form';

/**
 * Botón "Dejar un comentario" para una esquina de la sección de testimonios.
 * El formulario (TestimonialFormComponent, sin cambios) vive oculto en un
 * modal hasta que se abre — no ocupa lugar en la página por defecto.
 */
@Component({
  selector: 'app-testimonial-cta',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, TestimonialFormComponent],
  templateUrl: './testimonial-cta.html',
  styleUrl: './testimonial-cta.scss',
})
export class TestimonialCtaComponent {
  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected close(): void {
    this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open()) {
      this.close();
    }
  }
}
