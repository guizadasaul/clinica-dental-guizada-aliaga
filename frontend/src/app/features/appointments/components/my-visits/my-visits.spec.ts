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

describe('MyVisitsComponent (CLI-210, reestilo CLI-216)', () => {
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
    const months = [...root.querySelectorAll('.visits__month')].map((m) => m.textContent?.trim());
    const history = root.querySelectorAll('.visits__section')[1].querySelectorAll('.visit');

    expect(months).toEqual(['Septiembre de 2026', 'Agosto de 2026']);
    expect(history).toHaveLength(3);
    expect(history[0].querySelector('.visit__time')?.textContent).toContain('10:30');
    expect(history[0].querySelector('.visit__date')?.textContent).toBe('Miércoles, 16 de septiembre');
    expect(history[0].querySelector('.visit__meta')?.textContent).toContain('Restauración con resina · Dra. Lucía Mamani');
    // Sin tratamiento se muestra como consulta; sin doctor, no se inventa uno.
    expect(history[1].querySelector('.visit__meta')?.textContent?.trim()).toBe('Consulta odontológica');
    // Las asistidas no llevan marca: solo las "No asistió".
    expect(history[0].querySelector('.visit__badge')).toBeNull();
  });

  it('solo las "No asistió" llevan una marca', () => {
    const root = setup(
      of([]),
      of([
        cita('b', '2026-09-16T14:30:00.000Z', { status: 'no_show' }),
        cita('a', '2025-03-14T14:00:00.000Z'),
      ]),
    );
    const history = root.querySelectorAll('.visit');

    expect(history[0].classList).toContain('visit--missed');
    expect(history[0].querySelector('.visit__badge--missed')?.textContent).toContain('No asististe');
    expect(history[1].querySelector('.visit__badge')).toBeNull();
  });

  it('muestra las próximas citas como filas confirmadas', () => {
    const root = setup(
      of([cita('n', '2026-10-09T14:30:00.000Z', { treatmentName: 'Limpieza dental' }), cita('m', '2026-10-21T20:00:00.000Z')]),
    );
    const upcoming = root.querySelectorAll('.visits__section')[0].querySelectorAll('.visit');

    expect(upcoming).toHaveLength(2);
    expect(upcoming[0].querySelector('.visit__date')?.textContent).toBe('Viernes, 9 de octubre');
    expect(upcoming[0].querySelector('.visit__meta')?.textContent).toContain('Limpieza dental');
    expect(upcoming[0].querySelector('.visit__badge--confirmed')?.textContent).toContain('Confirmada');
  });

  it('sin citas ni visitas muestra los estados vacíos', () => {
    const root = setup();

    expect(root.textContent).toContain('No tienes citas programadas');
    expect(root.textContent).toContain('Todavía no tienes visitas registradas');
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
