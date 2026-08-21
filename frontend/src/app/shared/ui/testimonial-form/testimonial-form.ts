import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TestimonialsService } from '../../../features/testimonials/services/testimonials.service';
import { normalizeFullName, validatePersonName } from '../../validation/full-name.validator';
import { hasCharSpam, hasHtml, hasUrls } from '../../validation/text-safety.validator';

const COMMENT_MIN_WORDS = 20;
const COMMENT_MAX_WORDS = 120;
const COMMENT_MAX_REPEAT = 10;

const TREATMENT_MIN_LENGTH = 2;
const TREATMENT_MAX_LENGTH = 150;
// Espejo de TREATMENT_RE en
// api/src/testimonials/infrastructure/http/dto/create-testimonial.dto.ts —
// cambiar los dos juntos.
const TREATMENT_RE = /^(?=.*[\p{L}\d])[\p{L}\p{M}\d\s,.'’()-]+$/u;

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

  // Capturado al construir el componente (cuando el visitante abre el formulario),
  // no al enviar — es la referencia contra la que se mide `elapsedMs`.
  private readonly openedAt = Date.now();

  protected readonly minWords = COMMENT_MIN_WORDS;
  protected readonly maxWords = COMMENT_MAX_WORDS;

  protected readonly name = signal('');
  protected readonly treatment = signal('');
  protected readonly comment = signal('');
  /** Honeypot anti-bot: un input oculto (no `display:none`) que un usuario real
   * nunca ve ni completa. Si llega con contenido, es un bot. */
  protected readonly website = signal('');
  protected readonly formError = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);

  protected readonly wordCount = computed(() => countWords(this.comment()));

  protected onSubmit(): void {
    if (this.submitting()) return;

    // Regla suave (validatePersonName, una palabra alcanza) — a diferencia de
    // step-guest-contact.ts (reserva de cita, validateFullName exige nombre y
    // apellido). Misma decisión que el backend (ver CreateTestimonialDto.name).
    const nameError = validatePersonName(this.name());
    if (nameError === 'empty' || nameError === 'too-long') {
      this.formError.set(this.translate.instant('landing.testimonials.form.errors.name'));
      return;
    }
    if (nameError === 'invalid-chars') {
      this.formError.set(
        this.translate.instant('landing.testimonials.form.errors.nameInvalidChars'),
      );
      return;
    }

    const treatment = this.treatment().trim();
    if (treatment.length < TREATMENT_MIN_LENGTH || treatment.length > TREATMENT_MAX_LENGTH) {
      this.formError.set(this.translate.instant('landing.testimonials.form.errors.treatment'));
      return;
    }
    if (!TREATMENT_RE.test(treatment)) {
      this.formError.set(
        this.translate.instant('landing.testimonials.form.errors.treatmentInvalid'),
      );
      return;
    }

    const comment = this.comment().trim();
    const words = countWords(comment);
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
    if (hasHtml(comment)) {
      this.formError.set(this.translate.instant('landing.testimonials.form.errors.commentHtml'));
      return;
    }
    if (hasUrls(comment)) {
      this.formError.set(this.translate.instant('landing.testimonials.form.errors.commentUrl'));
      return;
    }
    if (hasCharSpam(comment, COMMENT_MAX_REPEAT)) {
      this.formError.set(this.translate.instant('landing.testimonials.form.errors.commentSpam'));
      return;
    }

    this.formError.set(null);
    this.submitting.set(true);
    this.testimonialsService
      .submit({
        name: normalizeFullName(this.name()),
        treatment,
        comment,
        website: this.website(),
        elapsedMs: Date.now() - this.openedAt,
      })
      .subscribe({
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
