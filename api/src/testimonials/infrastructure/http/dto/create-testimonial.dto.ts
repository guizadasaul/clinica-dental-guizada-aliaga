import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { WordCount } from '../../../../shared/validators/word-count.validator.js';
import {
  IsPersonName,
  normalizeFullName,
} from '../../../../shared/validators/full-name.validator.js';
import {
  NoCharSpam,
  NoHtml,
  NoUrls,
} from '../../../../shared/validators/text-safety.validator.js';

const COMMENT_MIN_WORDS = 20;
const COMMENT_MAX_WORDS = 120;
const COMMENT_MAX_REPEAT = 10;

// Letras (con marcas diacríticas), dígitos, espacio, coma, punto, apóstrofo,
// paréntesis y guion. La coma y el punto tienen que estar permitidos: hay
// tratamientos reales guardados como "Limpieza, profilaxis y flúor". El
// resto de símbolos (@ < > ; / \ :) queda afuera por no estar en la
// whitelist — no hace falta excluirlos explícitamente. El lookahead
// `(?=.*[\p{L}\d])` exige al menos una letra o dígito en algún lugar del
// texto, para que algo como "---" o "..." (puntuación permitida pero sin
// ningún carácter "de verdad") no pase la validación.
// Espejo de TREATMENT_RE en
// frontend/src/app/shared/ui/testimonial-form/testimonial-form.ts —
// cambiar los dos juntos.
const TREATMENT_RE = /^(?=.*[\p{L}\d])[\p{L}\p{M}\d\s,.'’()-]+$/u;

export class CreateTestimonialDto {
  // Regla suave (@IsPersonName, una palabra alcanza) — a diferencia de
  // GuestContactDto.fullName (reserva de cita, @IsFullName exige nombre y
  // apellido). Decisión tomada (CLI-36): en un comentario público obligar
  // apellido agrega fricción sin ganancia de seguridad — PERSON_NAME_RE
  // bloquea igual "123", "a@b.com" y "<script>", que es lo que importa acá.
  // Además el único testimonio aprobado hoy en la base se llama "Laura", sin
  // apellido.
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeFullName(value) : value,
  )
  @IsPersonName()
  @Length(2, 100)
  name!: string;

  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(2, 150)
  @Matches(TREATMENT_RE, {
    message:
      "treatment solo puede tener letras, números, espacios y , . ' ( ) -",
  })
  @NoUrls()
  treatment!: string;

  @IsString()
  @MaxLength(1200)
  @WordCount(COMMENT_MIN_WORDS, COMMENT_MAX_WORDS)
  @NoHtml()
  @NoUrls()
  @NoCharSpam(COMMENT_MAX_REPEAT)
  comment!: string;

  // --- Anti-bot (CLI-36) — el endpoint es público, sin sesión, a propósito.
  // Los dos campos siguientes tienen que estar declarados acá: con
  // forbidNonWhitelisted:true (ver api/src/app.config.ts) cualquier campo no
  // declarado en el DTO devuelve 400, así que si no están acá el formulario
  // ni siquiera podría mandarlos. La decisión de qué hacer si vienen "mal"
  // vive en TestimonialsService.create(), no en el DTO ni en el controller.

  /** Honeypot: input oculto que un humano nunca completa. Vacío/ausente si es legítimo. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  /** Ms desde que se abrió el formulario (Date.now() al construir el componente). */
  @IsOptional()
  @IsInt()
  @Min(0)
  elapsedMs?: number;
}
