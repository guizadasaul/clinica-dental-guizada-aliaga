import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TestimonialsService } from '../../services/testimonials.service';
import type { TestimonialResponse } from '../../models/testimonial.model';

const DATE_FORMATTER = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

@Component({
  selector: 'app-testimonial-review',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './testimonial-review.html',
  styleUrl: './testimonial-review.scss',
})
export class TestimonialReviewComponent {
  private readonly testimonialsService = inject(TestimonialsService);

  protected readonly pending = signal<TestimonialResponse[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  /** ids con una acción (aprobar/rechazar) en curso, para deshabilitar sus botones. */
  protected readonly actingOn = signal<Set<string>>(new Set());

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.testimonialsService.getPending());
      this.pending.set(result);
    } catch {
      this.error.set('No pudimos cargar los comentarios pendientes.');
    } finally {
      this.loading.set(false);
    }
  }

  protected formatDate(iso: string): string {
    return DATE_FORMATTER.format(new Date(iso));
  }

  protected async onApprove(id: string): Promise<void> {
    await this.review(id, this.testimonialsService.approve(id));
  }

  protected async onReject(id: string): Promise<void> {
    await this.review(id, this.testimonialsService.reject(id));
  }

  private async review(id: string, action$: ReturnType<TestimonialsService['approve']>): Promise<void> {
    this.actingOn.update((set) => new Set(set).add(id));
    try {
      await firstValueFrom(action$);
      this.pending.update((list) => list.filter((t) => t.id !== id));
    } catch {
      this.error.set('No pudimos actualizar ese comentario. Intentá de nuevo.');
    } finally {
      this.actingOn.update((set) => {
        const next = new Set(set);
        next.delete(id);
        return next;
      });
    }
  }
}
