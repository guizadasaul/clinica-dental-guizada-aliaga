import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TestimonialReviewComponent } from './testimonial-review';
import { TestimonialsService } from '../../services/testimonials.service';
import type { TestimonialResponse } from '../../models/testimonial.model';

const pending = (id: string): TestimonialResponse => ({
  id,
  name: `Persona ${id}`,
  treatment: 'Limpieza',
  comment: `Comentario ${id}`,
  status: 'pending',
  createdAt: '2026-09-20T12:00:00Z',
  updatedAt: '2026-09-20T12:00:00Z',
});

async function setup(list: TestimonialResponse[] | Error = [pending('1'), pending('2')]) {
  const service = {
    getPending: vi.fn(() => (list instanceof Error ? throwError(() => list) : of(list))),
    approve: vi.fn(() => of({})),
    reject: vi.fn(() => of({})),
  };
  TestBed.configureTestingModule({
    imports: [TestimonialReviewComponent],
    providers: [{ provide: TestimonialsService, useValue: service }],
  });
  const fixture = TestBed.createComponent(TestimonialReviewComponent);
  const root = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const names = () => [...root.querySelectorAll('.review-item__name')].map((n) => n.textContent);
  return { root, service, settle, names };
}

describe('TestimonialReviewComponent', () => {
  it('lista los comentarios pendientes con su fecha', async () => {
    const { root, names } = await setup();

    expect(names()).toEqual(['Persona 1', 'Persona 2']);
    expect(root.querySelector('.review-item__date')?.textContent?.trim()).not.toBe('');
  });

  it('sin pendientes lo avisa', async () => {
    const { root } = await setup([]);

    expect(root.textContent).toContain('No hay comentarios pendientes de revisión');
  });

  it('si no cargan, muestra el error', async () => {
    const { root } = await setup(new Error('500'));

    expect(root.textContent).toContain('No pudimos cargar los comentarios pendientes');
  });

  it.each([
    ['aprobar', '.review-item__btn--approve', 'approve'],
    ['rechazar', '.review-item__btn--reject', 'reject'],
  ] as const)('%s lo saca de la cola', async (_, selector, method) => {
    const { root, service, settle, names } = await setup();

    root.querySelector<HTMLButtonElement>(selector)!.click();
    await settle();

    expect(service[method]).toHaveBeenCalledWith('1');
    expect(names()).toEqual(['Persona 2']);
  });

  it('si la moderación falla, avisa y el comentario sigue en la cola con sus botones habilitados', async () => {
    const { root, service, settle, names } = await setup();
    service.approve.mockReturnValue(throwError(() => new Error('500')));

    root.querySelector<HTMLButtonElement>('.review-item__btn--approve')!.click();
    await settle();

    expect(root.textContent).toContain('No pudimos actualizar ese comentario');
    expect(names()).toEqual(['Persona 1', 'Persona 2']);
    expect(root.querySelector<HTMLButtonElement>('.review-item__btn--approve')!.disabled).toBe(false);
  });
});
