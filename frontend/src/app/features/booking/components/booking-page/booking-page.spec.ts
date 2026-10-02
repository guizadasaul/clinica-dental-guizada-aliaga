import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { BookingPageComponent } from './booking-page';
import { BookingService } from '../../services/booking.service';
import type { Doctor } from '../../models/booking.model';

const DOCTOR: Doctor = {
  id: 'doctor-1',
  displayName: 'Dra. Ejemplo',
  specialty: 'Ortodoncia',
  bio: null,
  photoUrl: null,
  displayOrder: 0,
  isBookable: true,
};

// Slot fijo, siempre en el futuro relativo al momento en que corre el test
// (no una fecha hardcodeada) — HoldCountdownComponent compara holdExpiresAt
// contra Date.now() real y emite (expired) apenas se renderiza si ya venció,
// lo que devolvía al paso 'slot' cada vez que el test corría después de esa
// hora del día.
const SLOT_ISO = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const HOLD_EXPIRES_AT_ISO = new Date(Date.now() + 10 * 60 * 1000).toISOString();

function createBookingServiceStub(overrides: Record<string, unknown> = {}) {
  return {
    getDoctors: vi.fn().mockReturnValue(of([DOCTOR])),
    getAvailabilityRange: vi.fn().mockReturnValue(of({ from: '2026-09-16', days: 14, slotsByDate: {} })),
    holdSlot: vi.fn().mockReturnValue(
      of({ appointmentId: 'appt-1', slot: SLOT_ISO, holdExpiresAt: HOLD_EXPIRES_AT_ISO }),
    ),
    ...overrides,
  };
}

function createActivatedRouteStub(queryParams: Record<string, string> = {}) {
  return { snapshot: { queryParamMap: convertToParamMap(queryParams) } };
}

function setup(
  bookingService: ReturnType<typeof createBookingServiceStub>,
  queryParams: Record<string, string> = {},
) {
  TestBed.configureTestingModule({
    imports: [BookingPageComponent],
    providers: [
      provideTranslateService({ defaultLanguage: 'es' }),
      { provide: BookingService, useValue: bookingService },
      { provide: ActivatedRoute, useValue: createActivatedRouteStub(queryParams) },
    ],
  });
  return TestBed.createComponent(BookingPageComponent);
}

async function settle(fixture: ReturnType<typeof setup>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('BookingPageComponent', () => {
  it('starts at the doctor step and loads the bookable doctors', async () => {
    const bookingService = createBookingServiceStub();
    const fixture = setup(bookingService);
    await settle(fixture);

    expect(bookingService.getDoctors).toHaveBeenCalled();
    expect(fixture.componentInstance['step']()).toBe('doctor');
    expect(fixture.componentInstance['doctors']()).toEqual([DOCTOR]);
  });

  it('choosing a doctor moves to the slot step and loads availability scoped to that doctor', async () => {
    const bookingService = createBookingServiceStub();
    const fixture = setup(bookingService);
    await settle(fixture);

    fixture.componentInstance['onDoctorSelected']('doctor-1');
    await settle(fixture);

    expect(fixture.componentInstance['step']()).toBe('slot');
    expect(bookingService.getAvailabilityRange).toHaveBeenCalledWith(
      expect.any(String),
      'doctor-1',
    );
  });

  it('en el paso de horarios pasa el nombre del doctor elegido al selector (CLI-164)', async () => {
    const bookingService = createBookingServiceStub();
    const fixture = setup(bookingService);
    await settle(fixture);

    fixture.componentInstance['onDoctorSelected']('doctor-1');
    await settle(fixture);

    expect(fixture.componentInstance['selectedDoctorName']()).toBe('Dra. Ejemplo');
  });

  it('selecting a slot holds it for the previously chosen doctor and moves to contact', async () => {
    const bookingService = createBookingServiceStub();
    const fixture = setup(bookingService);
    await settle(fixture);
    fixture.componentInstance['onDoctorSelected']('doctor-1');
    await settle(fixture);

    await fixture.componentInstance['onSlotSelected'](SLOT_ISO);
    await settle(fixture);

    expect(bookingService.holdSlot).toHaveBeenCalledWith(SLOT_ISO, 'doctor-1');
    expect(fixture.componentInstance['step']()).toBe('contact');
  });

  it('"elegir otro doctor" desde un doctor sin turnos vuelve al selector (CLI-142)', async () => {
    const bookingService = createBookingServiceStub();
    const fixture = setup(bookingService);
    await settle(fixture);
    fixture.componentInstance['onDoctorSelected']('doctor-1');
    await settle(fixture);

    fixture.componentInstance['onChangeDoctor']();
    await settle(fixture);

    expect(fixture.componentInstance['step']()).toBe('doctor');
    expect(fixture.componentInstance['selectedDoctorId']()).toBeNull();
    // La lista ya estaba cargada: no se vuelve a pedir.
    expect(bookingService.getDoctors).toHaveBeenCalledTimes(1);
  });

  it('si se llegó con el doctor preelegido desde la landing, "elegir otro doctor" carga la lista', async () => {
    const bookingService = createBookingServiceStub();
    const fixture = setup(bookingService, { doctorId: 'doctor-1', slot: SLOT_ISO });
    await settle(fixture);

    fixture.componentInstance['onChangeDoctor']();
    await settle(fixture);

    expect(bookingService.getDoctors).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance['doctors']()).toEqual([DOCTOR]);
  });

  // El modal de la landing manda ?doctorId=&slot= cuando el visitante ya
  // eligió doctor y horario ahí — /reservar no debe repreguntar el doctor.
  it('with ?doctorId and ?slot in the URL, holds directly and skips the doctor/slot pickers', async () => {
    const bookingService = createBookingServiceStub();
    const fixture = setup(bookingService, {
      doctorId: 'doctor-1',
      slot: SLOT_ISO,
    });
    await settle(fixture);

    expect(bookingService.getDoctors).not.toHaveBeenCalled();
    expect(bookingService.holdSlot).toHaveBeenCalledWith(SLOT_ISO, 'doctor-1');
    expect(fixture.componentInstance['step']()).toBe('contact');
  });
});
