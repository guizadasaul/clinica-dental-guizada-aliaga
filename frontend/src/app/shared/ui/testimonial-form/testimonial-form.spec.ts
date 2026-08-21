import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TestimonialFormComponent } from './testimonial-form';

const VALID_COMMENT =
  'Excelente atención en toda la clínica, el equipo fue muy profesional ' +
  'y atento durante todo el tratamiento que me realizaron hace poco.';

function setup() {
  TestBed.configureTestingModule({
    imports: [TestimonialFormComponent],
    providers: [
      provideTranslateService({ defaultLanguage: 'es' }),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(TestimonialFormComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, httpMock };
}

function el<T extends Element>(fixture: ReturnType<typeof setup>['fixture'], selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

// El nombre, el tratamiento y el comentario comparten la clase
// `.testimonial-form__input` (el comentario además tiene `__textarea`) — se
// distinguen por orden de aparición en el markup, no por tipo.
function fields(
  fixture: ReturnType<typeof setup>['fixture'],
): [HTMLInputElement, HTMLInputElement, HTMLTextAreaElement] {
  const nodes = (fixture.nativeElement as HTMLElement).querySelectorAll('.testimonial-form__input');
  return [nodes[0], nodes[1], nodes[2]] as [HTMLInputElement, HTMLInputElement, HTMLTextAreaElement];
}

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function submitForm(fixture: ReturnType<typeof setup>['fixture']): void {
  el<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
}

async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
}

const ERROR = '.testimonial-form__error';

describe('TestimonialFormComponent', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('rechaza un nombre con números (no envía nada al backend)', async () => {
    const { fixture, httpMock } = setup();
    await settle(fixture);

    const [name, treatment, comment] = fields(fixture);
    type(name, 'Laura 123');
    type(treatment, 'Limpieza dental');
    type(comment, VALID_COMMENT);
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)?.textContent).toContain(
      'landing.testimonials.form.errors.nameInvalidChars',
    );
    httpMock.expectNone(() => true);
  });

  it('rechaza un comentario con <script> (no envía nada al backend)', async () => {
    const { fixture, httpMock } = setup();
    await settle(fixture);

    const [name, treatment, comment] = fields(fixture);
    type(name, 'Laura');
    type(treatment, 'Limpieza dental');
    type(comment, `${VALID_COMMENT} <script>alert(1)</script>`);
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)?.textContent).toContain(
      'landing.testimonials.form.errors.commentHtml',
    );
    httpMock.expectNone(() => true);
  });

  it('rechaza un comentario con un link (no envía nada al backend)', async () => {
    const { fixture, httpMock } = setup();
    await settle(fixture);

    const [name, treatment, comment] = fields(fixture);
    type(name, 'Laura');
    type(treatment, 'Limpieza dental');
    type(comment, `${VALID_COMMENT} http://spam.com`);
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)?.textContent).toContain(
      'landing.testimonials.form.errors.commentUrl',
    );
    httpMock.expectNone(() => true);
  });

  it('envía un comentario válido de 20+ palabras', async () => {
    const { fixture, httpMock } = setup();
    await settle(fixture);

    const [name, treatment, comment] = fields(fixture);
    type(name, 'Laura');
    type(treatment, 'Limpieza dental');
    type(comment, VALID_COMMENT);
    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, ERROR)).toBeNull();
    const req = httpMock.expectOne((request) => request.url.endsWith('/public/testimonials'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({
      name: 'Laura',
      treatment: 'Limpieza dental',
      comment: VALID_COMMENT,
    });
    req.flush({
      id: 't-1',
      name: 'Laura',
      treatment: 'Limpieza dental',
      comment: VALID_COMMENT,
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });
});
