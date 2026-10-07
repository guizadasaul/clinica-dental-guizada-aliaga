import { TestBed } from '@angular/core/testing';
import { BookingProgressComponent, type BookingStepKey } from './booking-progress';

function render(step: BookingStepKey) {
  TestBed.configureTestingModule({ imports: [BookingProgressComponent] });
  const fixture = TestBed.createComponent(BookingProgressComponent);
  fixture.componentRef.setInput('step', step);
  fixture.detectChanges();
  const items = [...(fixture.nativeElement as HTMLElement).querySelectorAll('li')];
  return {
    labels: items.map((li) => li.querySelector('.booking-progress__label')?.textContent?.trim()),
    done: items.filter((li) => li.classList.contains('booking-progress__item--done')).length,
    current: items.filter((li) => li.getAttribute('aria-current') === 'step').map((li) => li.textContent),
  };
}

describe('BookingProgressComponent', () => {
  it('muestra los cuatro pasos de la reserva', () => {
    expect(render('doctor').labels).toEqual(['Doctor', 'Horario', 'Tus datos', 'Pago']);
  });

  it.each([
    ['doctor', 0, 'Doctor'],
    ['slot', 1, 'Horario'],
    ['contact', 2, 'Tus datos'],
    ['payment', 3, 'Pago'],
  ] as const)('en %s: %i pasos hechos y el actual es %s', (step, done, label) => {
    const result = render(step);
    expect(result.done).toBe(done);
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toContain(label);
  });

  it('con la reserva confirmada todos los pasos quedan completos', () => {
    const result = render('confirmed');
    expect(result.done).toBe(4);
    expect(result.current).toHaveLength(0);
  });
});
