import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTestimonialDto } from './create-testimonial.dto';
import { INJECTION_PAYLOADS } from '../../../../shared/validators/__fixtures__/injection-payloads';

const VALID_COMMENT =
  'Excelente atención en toda la clínica, el equipo fue muy profesional ' +
  'y atento durante todo el tratamiento que me realizaron hace poco.';

const VALID_TESTIMONIAL = {
  name: 'Laura',
  treatment: 'Limpieza, profilaxis y flúor',
  comment: VALID_COMMENT,
};

// "admin'--" es, carácter por carácter, letras + apostrofo + guiones — la
// misma forma que un nombre real como "O'Brien" o un tratamiento como
// "Post-operatorio". PERSON_NAME_RE (regla suave de `name`) y TREATMENT_RE
// lo aceptan por diseño (ver el comentario de CreateTestimonialDto.name) —
// no es un bug, es la contrapartida de la regla laxa. No representa riesgo
// real: Prisma parametriza, así que ni siquiera "colándose" ahí produce
// inyección. `comment` sí lo rechaza siempre, vía @WordCount.
const PAYLOADS_WITH_FORBIDDEN_CHARS = INJECTION_PAYLOADS.filter(
  (payload) => payload !== "admin'--",
);

async function validateTestimonial(
  overrides: Partial<typeof VALID_TESTIMONIAL>,
) {
  const dto = plainToInstance(CreateTestimonialDto, {
    ...VALID_TESTIMONIAL,
    ...overrides,
  });
  return validate(dto);
}

describe('CreateTestimonialDto', () => {
  it('acepta un testimonio válido', async () => {
    const errors = await validateTestimonial({});
    expect(errors).toHaveLength(0);
  });

  it('acepta "Laura" sin apellido (regla suave, a diferencia de GuestContactDto.fullName)', async () => {
    const errors = await validateTestimonial({ name: 'Laura' });
    expect(errors).toHaveLength(0);
  });

  describe.each(INJECTION_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('rechaza el payload en comment (word count, siempre)', async () => {
      const errors = await validateTestimonial({ comment: payload });
      expect(errors.some((e) => e.property === 'comment')).toBe(true);
    });
  });

  describe.each(PAYLOADS_WITH_FORBIDDEN_CHARS)(
    'payload de inyección con símbolos no permitidos: %s',
    (payload) => {
      it('rechaza el payload en name', async () => {
        const errors = await validateTestimonial({ name: payload });
        expect(errors.some((e) => e.property === 'name')).toBe(true);
      });

      it('rechaza el payload en treatment', async () => {
        const errors = await validateTestimonial({ treatment: payload });
        expect(errors.some((e) => e.property === 'treatment')).toBe(true);
      });
    },
  );

  it('rechaza HTML en comment', async () => {
    const errors = await validateTestimonial({
      comment: `${VALID_COMMENT} <script>alert(1)</script>`,
    });
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('rechaza URLs en comment', async () => {
    const errors = await validateTestimonial({
      comment: `${VALID_COMMENT} http://spam.com`,
    });
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('no rechaza "excelente.Muy recomendable" (no es un TLD conocido)', async () => {
    const errors = await validateTestimonial({
      comment: `${VALID_COMMENT} excelente.Muy recomendable de verdad`,
    });
    expect(errors.some((e) => e.property === 'comment')).toBe(false);
  });

  it('rechaza caracteres repetidos (spam) en comment', async () => {
    const errors = await validateTestimonial({
      comment: `${VALID_COMMENT} aaaaaaaaaaaaaaa`,
    });
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('permite coma y punto en treatment ("Limpieza, profilaxis y flúor")', async () => {
    const errors = await validateTestimonial({
      treatment: 'Limpieza, profilaxis y flúor',
    });
    expect(errors.some((e) => e.property === 'treatment')).toBe(false);
  });

  it('rechaza treatment que es solo puntuación ("---")', async () => {
    const errors = await validateTestimonial({ treatment: '---' });
    expect(errors.some((e) => e.property === 'treatment')).toBe(true);
  });

  it('acepta website/elapsedMs ausentes (whitelist no los exige)', async () => {
    const dto = plainToInstance(CreateTestimonialDto, VALID_TESTIMONIAL);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
