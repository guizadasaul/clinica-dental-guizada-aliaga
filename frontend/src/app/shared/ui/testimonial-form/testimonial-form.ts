import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TestimonialsService } from '../../../features/testimonials/services/testimonials.service';

const COMMENT_MIN_WORDS = 20;
const COMMENT_MAX_WORDS = 120;

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/** Formulario para que un visitante deje un testimonio nuevo. Queda
 * "pending" en el backend hasta aprobarse a mano — ver TestimonialsController. */
@Component({
  selector: 'app-testimonial-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './testimonial-form.html',
  styleUrl: './testimonial-form.scss',
})
export class TestimonialFormComponent {
  private readonly testimonialsService = inject(TestimonialsService);
  private readonly translate = inject(TranslateService);

  protected readonly minWords = COMMENT_MIN_WORDS;
  protected readonly maxWords = COMMENT_MAX_WORDS;

  protected readonly name = signal('');
  protected readonly treatment = signal('');
  protected readonly comment = signal('');
  protected readonly formError = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);

  protected readonly wordCount = computed(() => countWords(this.comment()));

  protected onSubmit(): void {
    if (this.submitting()) return;

    const name = this.name().trim();
    const treatment = this.treatment().trim();
    const comment = this.comment().trim();
    const words = countWords(comment);

    if (name.length < 2) {
      this.formError.set(this.translate.instant('landing.testimonials.form.errors.name'));
      return;
    }
    if (treatment.length < 2) {
      this.formError.set(this.translate.instant('landing.testimonials.form.errors.treatment'));
      return;
    }
    if (words < this.minWords || words > this.maxWords) {
      this.formError.set(
        this.translate.instant('landing.testimonials.form.errors.comment', {
          min: this.minWords,
          max: this.maxWords,
          count: words,
        }),
      );
      return;
    }

    this.formError.set(null);
    this.submitting.set(true);
    this.testimonialsService.submit({ name, treatment, comment }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.submitted.set(true);
      },
      error: () => {
        this.submitting.set(false);
        this.formError.set(this.translate.instant('landing.testimonials.form.errors.generic'));
      },
    });
  }
}
