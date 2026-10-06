import { TestBed } from '@angular/core/testing';
import { NEVER, of, throwError, type Observable } from 'rxjs';
import { MyVisitsComponent } from './my-visits';
import { AppointmentsService } from '../../services/appointments.service';
import type { PatientAppointment } from '../../models/appointment.model';

function cita(id: string, iso: string, extra: Partial<PatientAppointment> = {}): PatientAppointment {
  return {
    id,
    appointmentDatetime: iso,
    durationMinutes: 45,
    doctorName: 'Dra. Lucía Mamani',
    treatmentName: 'Restauración con resina',
    status: 'confirmed',
    ...extra,
  };
}

function setup(
  upcoming: Observable<PatientAppointment[]> = of([]),
  past: Observable<PatientAppointment[]> = of([]),
) {
  TestBed.configureTestingModule({
    imports: [MyVisitsComponent],
    providers: [
      {
        provide: AppointmentsService,
        useValue: { getMyUpcoming: () => upcoming, getMyPast: () => past },
      },
    ],
  });
  const fixture = TestBed.createComponent(MyVisitsComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('MyVisitsComponent (CLI-210)', () => {
  afterEach(() => vi.useRealTimers());

  it('mientras carga lo dice', () => {
    expect(setup(NEVER).textContent).toContain('Cargando tus citas...');
  });

  it('agrupa las visitas pasadas por mes, de la más reciente a la más antigua', () => {
    const root = setup(
      of([]),
      of([
        cita('c', '2026-09-16T14:30:00.000Z'),
        cita('b', '2026-09-02T19:00:00.000Z', { treatmentName: null, doctorName: null }),
        cita('a', '2026-08-18T15:00:00.000Z', { status: 'attended' }),
      ]),
    );
    const months = [...root.querySelectorAll('.month__name')].map((m) => m.textContent?.trim());
    const visits = root.querySelectorAll('.visit');

    expect(months).toEqual(['Septiembre de 2026', 'Agosto de 2026']);
    expect(visits).toHaveLength(3);
    expect(visits[0].textContent).toContain('Miércoles, 16 de septiembre · 10:30');
    expect(visits[0].textContent).toContain('Restauración con resina');
    expect(visits[0].textContent).toContain('Dra. Lucía Mamani');
    expect(visits[0].querySelector('.visit__badge-month')?.textContent).toBe('SEPT');
    // Sin tratamiento se muestra como consulta; sin doctor, no se inventa uno.
    expect(visits[1].textContent).toContain('Consulta odontológica');
    expect(visits[1].querySelector('.visit__doctor')).toBeNull();
  });

  it('las "No asistió" se ven distintas y no cuentan como visita', () => {
    const root = setup(
      of([]),
      of([
        cita('b', '2026-09-16T14:30:00.000Z', { status: 'no_show' }),
        cita('a', '2025-03-14T14:00:00.000Z'),
      ]),
    );
    const visits = root.querySelectorAll('.visit');

    expect(visits[0].classList).toContain('visit--missed');
    expect(visits[0].textContent).toContain('No asististe');
    expect(visits[1].textContent).toContain('Asististe');
    const summary = root.querySelector('.summary')?.textContent ?? '';
    expect(summary).toContain('1 visita realizada');
    expect(summary).toContain('Primera visita: marzo de 2025');
  });

  it('muestra las próximas citas con su fecha, y cuánto falta para la primera', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T15:00:00.000Z'));
    const root = setup(
      of([cita('n', '2026-10-09T14:30:00.000Z', { treatmentName: 'Limpieza dental' }), cita('m', '2026-10-21T20:00:00.000Z')]),
    );
    const cards = root.querySelectorAll('.upcoming');

    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('.upcoming__weekday')?.textContent).toBe('Viernes');
    expect(cards[0].querySelector('.upcoming__day')?.textContent).toBe('09');
    expect(cards[0].textContent).toContain('Limpieza dental');
    expect(cards[0].textContent).toContain('(45 min)');
    expect(root.querySelector('.block__count')?.textContent).toContain('2 agendadas');
    expect(root.querySelector('.summary')?.textContent).toContain('En 3 días');
  });

  it.each([
    ['2026-10-06T22:00:00.000Z', 'Hoy'],
    ['2026-10-07T14:00:00.000Z', 'Mañana'],
  ])('una cita el %s se anuncia como "%s"', (iso, label) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T15:00:00.000Z'));

    expect(setup(of([cita('n', iso)])).querySelector('.summary')?.textContent).toContain(label);
  });

  it('sin citas ni visitas muestra los estados vacíos', () => {
    const root = setup();

    expect(root.textContent).toContain('No tienes citas programadas');
    expect(root.textContent).toContain('Todavía no tienes visitas registradas');
    expect(root.querySelector('.summary')?.textContent).toContain('Aún sin visitas');
    expect(root.querySelector('.summary')?.textContent).toContain('Sin citas programadas');
  });

  it('si falla la carga, muestra los estados vacíos en vez de quedarse cargando', () => {
    const root = setup(
      throwError(() => new Error('500')),
      throwError(() => new Error('500')),
    );

    expect(root.textContent).not.toContain('Cargando');
    expect(root.textContent).toContain('Todavía no tienes visitas registradas');
  });
});
