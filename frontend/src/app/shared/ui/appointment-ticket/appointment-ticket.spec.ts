import { TestBed } from '@angular/core/testing';
import { AppointmentTicketComponent } from './appointment-ticket';

// Lunes 5/10/2026 a las 10:00 en Bolivia.
const NOW = new Date('2026-10-05T14:00:00Z');

function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ imports: [AppointmentTicketComponent] });
  const fixture = TestBed.createComponent(AppointmentTicketComponent);
  fixture.componentRef.setInput('now', NOW);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const text = (el: HTMLElement, selector: string) => el.querySelector(selector)?.textContent?.trim();

describe('AppointmentTicketComponent (CLI-267)', () => {
  it('muestra el día en el talón, cuándo falta, el rango de horas, el tratamiento y el doctor', () => {
    const { el } = render({
      datetime: '2026-10-10T14:30:00Z', // sábado 10:30 en Bolivia
      durationMinutes: 45,
      title: 'Limpieza dental',
      doctorName: 'Dra. Lucía Mamani',
    });

    expect(text(el, '.ticket__day')).toBe('10');
    expect(text(el, '.ticket__month')).toBe('oct');
    expect(text(el, '.ticket__relative')).toBe('En 5 días');
    expect(text(el, '.ticket__weekday')).toBe('Sábado');
    expect(text(el, '.ticket__time')).toBe('10:30 – 11:15');
    expect(text(el, '.ticket__title')).toBe('Limpieza dental');
    expect(text(el, '.ticket__doctor')).toContain('Dra. Lucía Mamani');
    expect(el.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-10T14:30:00Z');
    expect(el.querySelector('.ticket')?.getAttribute('aria-label')).toContain('Limpieza dental');
  });

  it('sin duración ni doctor muestra solo la hora de inicio y no deja la línea del doctor vacía', () => {
    const { el } = render({ datetime: '2026-10-06T13:00:00Z', title: 'Consulta odontológica' });

    expect(text(el, '.ticket__time')).toBe('09:00');
    expect(el.querySelector('.ticket__doctor')).toBeNull();
  });

  it('hoy o mañana destaca el talón; más adelante no', () => {
    const soon = render({ datetime: '2026-10-06T13:00:00Z', title: 'Control' });
    expect(text(soon.el, '.ticket__relative')).toBe('Mañana');
    expect(soon.el.classList).toContain('ticket--soon');

    TestBed.resetTestingModule();
    const later = render({ datetime: '2026-10-20T13:00:00Z', title: 'Control', size: 'hero' });
    expect(later.el.classList).not.toContain('ticket--soon');
    expect(later.el.classList).toContain('ticket--hero');
  });
});
