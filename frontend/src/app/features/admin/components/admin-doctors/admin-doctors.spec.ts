import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { AdminDoctorsComponent } from './admin-doctors';
import { AdminDoctorsService } from '../../services/admin-doctors.service';
import { BookingService } from '../../../booking/services/booking.service';
import { AppointmentsService } from '../../../appointments/services/appointments.service';
import { PatientsService } from '../../../patients/services/patients.service';
import { AuthService } from '../../../../auth/application/auth.service';
import type { AdminDoctorDetail, AdminDoctorSummary } from '../../models/admin-doctor.model';
import type { Doctor } from '../../../booking/models/booking.model';
import type { PatientWithUser } from '../../../patients/models/patient.model';

const DOCTOR_SUMMARY: AdminDoctorSummary = {
  id: 'doctor-1',
  displayName: 'Juan Perez',
  firstName: 'Juan',
  lastNamePaternal: 'Perez',
  lastNameMaternal: null,
  registrationStatus: 'pending',
  email: 'juan@example.com',
  phone: '+59170011122',
  specialty: 'Ortodoncia',
  photoUrl: null,
  displayOrder: 0,
  isBookable: true,
  isActive: true,
};

const DOCTOR_DETAIL: AdminDoctorDetail = {
  ...DOCTOR_SUMMARY,
  bio: null,
  scheduleBlocks: [{ weekday: 1, start: '09:00', end: '12:00' }],
};

const PICKER_DOCTOR: Doctor = {
  id: 'doctor-1',
  displayName: 'Juan Perez',
  specialty: 'Ortodoncia',
  bio: null,
  photoUrl: null,
  displayOrder: 0,
  isBookable: true,
};

const PATIENT_WITH_USER: PatientWithUser = {
  userId: 'user-1',
  displayName: 'Juana Perez',
  email: 'juana@example.com',
  phone: '70011122',
  createdAt: new Date().toISOString(),
  dentalExamsCount: 1,
  hasAccount: true,
  patient: {
    id: 'patient-1',
    userId: 'user-1',
    firstName: 'Juana',
    lastNamePaternal: 'Perez',
    lastNameMaternal: null,
    birthDate: '1990-01-01',
    birthPlace: null,
    sex: null,
    occupation: null,
    address: null,
    zona: null,
    ciudad: null,
    phone: '70011122',
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    consultationReason: null,
    lastDentistVisit: null,
    lastVisitTreatment: null,
    familyHistory: null,
    documentType: null,
    dni: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assignedDoctorId: 'doctor-1',
  },
};

function setup(
  doctors: AdminDoctorSummary[] = [DOCTOR_SUMMARY],
  pickerDoctors: Doctor[] = [PICKER_DOCTOR],
  patients: PatientWithUser[] = [],
) {
  const adminDoctorsService = {
    getAll: vi.fn().mockReturnValue(of(doctors)),
    getById: vi.fn().mockReturnValue(of(DOCTOR_DETAIL)),
    create: vi.fn().mockReturnValue(of({ doctor: DOCTOR_DETAIL, inviteSent: true })),
    update: vi.fn().mockReturnValue(of(DOCTOR_DETAIL)),
    deactivate: vi.fn().mockReturnValue(of({ ...DOCTOR_DETAIL, isActive: false, isBookable: false })),
  };
  const bookingService = { getDoctors: vi.fn().mockReturnValue(of(pickerDoctors)) };
  const appointmentsService = { getAgenda: vi.fn().mockReturnValue(of([])) };
  const patientsService = { getAll: vi.fn().mockReturnValue(of(patients)) };
  const authService = {
    currentUser: signal({
      uid: 'auth-uid',
      id: 'admin-1',
      email: null,
      displayName: null,
      photoURL: null,
      role: 'admin',
    }),
  };
  TestBed.configureTestingModule({
    imports: [AdminDoctorsComponent],
    providers: [
      { provide: AdminDoctorsService, useValue: adminDoctorsService },
      { provide: BookingService, useValue: bookingService },
      { provide: AppointmentsService, useValue: appointmentsService },
      { provide: PatientsService, useValue: patientsService },
      { provide: AuthService, useValue: authService },
      provideTranslateService({ defaultLanguage: 'es' }),
    ],
  });
  const fixture = TestBed.createComponent(AdminDoctorsComponent);
  return { fixture, adminDoctorsService, bookingService, appointmentsService, patientsService };
}

function el<T extends Element>(fixture: ReturnType<typeof setup>['fixture'], selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

function allEls<T extends Element>(fixture: ReturnType<typeof setup>['fixture'], selector: string): T[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(selector));
}

async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function fillInput(fixture: ReturnType<typeof setup>['fixture'], selector: string, value: string): void {
  const input = el<HTMLInputElement>(fixture, selector);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function fillCreateNames(fixture: ReturnType<typeof setup>['fixture']): void {
  fillInput(fixture, '#admin-doctor-first-name', 'maria');
  fillInput(fixture, '#admin-doctor-last-name-paternal', 'LOPEZ');
  fillInput(fixture, '#admin-doctor-last-name-maternal', 'gomez');
}

function submitForm(fixture: ReturnType<typeof setup>['fixture']): void {
  el<HTMLFormElement>(fixture, '.admin-doctors__form').dispatchEvent(new Event('submit'));
}

describe('AdminDoctorsComponent', () => {
  it('loads and lists doctors from GET /admin/doctors on init', async () => {
    const { fixture, adminDoctorsService } = setup();
    await settle(fixture);

    expect(adminDoctorsService.getAll).toHaveBeenCalled();
    expect(el(fixture, '.admin-doctors__table')?.textContent).toContain('Juan Perez');
    expect(el(fixture, '.admin-doctors__table')?.textContent).toContain('Ortodoncia');
  });

  it('shows the empty state when there are no doctors', async () => {
    const { fixture } = setup([]);
    await settle(fixture);

    expect(el(fixture, '.admin-doctors__empty')).toBeTruthy();
  });

  it('shows an "Activo" badge for an active/bookable doctor and "Dado de baja" otherwise', async () => {
    const { fixture } = setup([
      DOCTOR_SUMMARY,
      { ...DOCTOR_SUMMARY, id: 'doctor-2', isActive: false, isBookable: false },
    ]);
    await settle(fixture);

    const badges = allEls(fixture, '.admin-doctors__badge');
    expect(badges[0]?.textContent).toContain('Activo');
    expect(badges[1]?.textContent).toContain('Dado de baja');
  });

  it('opens the create form and does not submit while the required fields are invalid', async () => {
    const { fixture, adminDoctorsService } = setup();
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.admin-doctors__header .admin-doctors__btn--primary').click();
    await settle(fixture);

    expect(el(fixture, '.admin-doctors__form')).toBeTruthy();

    submitForm(fixture);
    await settle(fixture);

    expect(adminDoctorsService.create).not.toHaveBeenCalled();
    expect(el(fixture, '.admin-doctors__field-error')).toBeTruthy();
  });

  it('submits the create form with the entered data and shows the invite result', async () => {
    const { fixture, adminDoctorsService } = setup();
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.admin-doctors__header .admin-doctors__btn--primary').click();
    await settle(fixture);

    const nameInput = el<HTMLInputElement>(fixture, '#admin-doctor-name');
    nameInput.value = 'Dra. Maria Lopez';
    nameInput.dispatchEvent(new Event('input'));
    const emailInput = el<HTMLInputElement>(fixture, '#admin-doctor-email');
    emailInput.value = 'maria@example.com';
    emailInput.dispatchEvent(new Event('input'));
    fillCreateNames(fixture);
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);
    await settle(fixture);

    expect(adminDoctorsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Dra. Maria Lopez',
        email: 'maria@example.com',
        firstName: 'Maria',
        lastNamePaternal: 'Lopez',
        lastNameMaternal: 'Gomez',
      }),
    );
    expect(adminDoctorsService.getAll).toHaveBeenCalledTimes(2);
    expect(el(fixture, '.admin-doctors__banner--success')?.textContent).toContain('invitación');
  });

  it('surfaces a friendly message on a 409 (duplicate email) instead of a raw error', async () => {
    const { fixture, adminDoctorsService } = setup();
    adminDoctorsService.create.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.admin-doctors__header .admin-doctors__btn--primary').click();
    await settle(fixture);
    const nameInput = el<HTMLInputElement>(fixture, '#admin-doctor-name');
    nameInput.value = 'Dra. Maria Lopez';
    nameInput.dispatchEvent(new Event('input'));
    const emailInput = el<HTMLInputElement>(fixture, '#admin-doctor-email');
    emailInput.value = 'maria@example.com';
    emailInput.dispatchEvent(new Event('input'));
    fillCreateNames(fixture);
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, '.admin-doctors__banner--error')?.textContent).toContain('Ya existe un usuario con ese email');
  });

  // CLI-76: nombre y apellidos separados.
  it('does not submit the create form when the first name or paternal last name are missing, even with public name and email filled', async () => {
    const { fixture, adminDoctorsService } = setup();
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.admin-doctors__header .admin-doctors__btn--primary').click();
    await settle(fixture);
    fillInput(fixture, '#admin-doctor-name', 'Dra. Maria Lopez');
    fillInput(fixture, '#admin-doctor-email', 'maria@example.com');
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);

    expect(adminDoctorsService.create).not.toHaveBeenCalled();
    const errors = allEls(fixture, '.admin-doctors__field-error').map((e) => e.textContent);
    expect(errors.some((t) => t?.includes('El nombre es obligatorio'))).toBe(true);
    expect(errors.some((t) => t?.includes('El apellido paterno es obligatorio'))).toBe(true);
  });

  it('rejects digits in the name parts', async () => {
    const { fixture, adminDoctorsService } = setup();
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.admin-doctors__header .admin-doctors__btn--primary').click();
    await settle(fixture);
    fillCreateNames(fixture);
    fillInput(fixture, '#admin-doctor-first-name', 'Maria2');
    fillInput(fixture, '#admin-doctor-name', 'Dra. Maria Lopez');
    fillInput(fixture, '#admin-doctor-email', 'maria@example.com');
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);

    expect(adminDoctorsService.create).not.toHaveBeenCalled();
    expect(el(fixture, '.admin-doctors__form')?.textContent).toContain('solo puede tener letras');
  });

  it('lets a doctor loaded before CLI-76 (no first/last name) be edited without filling them in', async () => {
    const { fixture, adminDoctorsService } = setup();
    adminDoctorsService.getById.mockReturnValue(
      of({ ...DOCTOR_DETAIL, firstName: null, lastNamePaternal: null, lastNameMaternal: null }),
    );
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.admin-doctors__cell--actions .admin-doctors__btn:not(.admin-doctors__btn--outline):not(.admin-doctors__btn--ghost)').click();
    await settle(fixture);
    await settle(fixture);

    expect(el<HTMLInputElement>(fixture, '#admin-doctor-first-name').value).toBe('');

    submitForm(fixture);
    await settle(fixture);
    await settle(fixture);

    expect(adminDoctorsService.update).toHaveBeenCalledWith(
      'doctor-1',
      expect.objectContaining({ firstName: undefined, lastNamePaternal: undefined }),
    );
  });

  it('deactivating a doctor requires a two-step confirmation before calling the service', async () => {
    const { fixture, adminDoctorsService } = setup();
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.admin-doctors__cell--actions .admin-doctors__btn--ghost').click();
    await settle(fixture);

    expect(adminDoctorsService.deactivate).not.toHaveBeenCalled();
    expect(el(fixture, '.admin-doctors__confirm')).toBeTruthy();

    el<HTMLButtonElement>(fixture, '.admin-doctors__btn--danger').click();
    await settle(fixture);

    expect(adminDoctorsService.deactivate).toHaveBeenCalledWith('doctor-1');
  });

  // CLI-64: vista de solo lectura de agenda/pacientes de cualquier doctor.
  describe('doctor detail view', () => {
    it('opens the picker without a preselected doctor from the header shortcut', async () => {
      const { fixture, bookingService } = setup();
      await settle(fixture);

      el<HTMLButtonElement>(fixture, '.admin-doctors__header-actions .admin-doctors__btn--outline').click();
      await settle(fixture);

      expect(bookingService.getDoctors).toHaveBeenCalled();
      expect(el(fixture, 'app-doctor-picker')).toBeTruthy();
      expect(el(fixture, 'app-doctor-agenda')).toBeFalsy();
      expect(el(fixture, 'app-patients-list')).toBeFalsy();
    });

    it('opening the detail from a doctor row preselects that doctor and shows the read-only agenda', async () => {
      const { fixture, appointmentsService } = setup();
      await settle(fixture);

      el<HTMLButtonElement>(fixture, '.admin-doctors__cell--actions .admin-doctors__btn--outline').click();
      await settle(fixture);

      expect(el(fixture, 'app-doctor-agenda')).toBeTruthy();
      expect(appointmentsService.getAgenda).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: 'doctor-1' }),
      );
    });

    it('switching to the "Pacientes" tab loads that doctor patients, read-only and without the "Los míos" toggle', async () => {
      const { fixture, patientsService } = setup([DOCTOR_SUMMARY], [PICKER_DOCTOR], [PATIENT_WITH_USER]);
      await settle(fixture);

      el<HTMLButtonElement>(fixture, '.admin-doctors__cell--actions .admin-doctors__btn--outline').click();
      await settle(fixture);
      allEls<HTMLButtonElement>(fixture, '.admin-doctors__tab')[1].click();
      await settle(fixture);

      expect(patientsService.getAll).toHaveBeenCalledWith('doctor-1');
      expect(el(fixture, 'app-patients-list')).toBeTruthy();
      expect(el(fixture, '.patients-list__owner-toggle')).toBeFalsy();
      expect(el(fixture, '.patients-list__cell--actions')).toBeFalsy();
    });

    it('picking a different doctor from the picker switches the selected doctor', async () => {
      const OTHER_PICKER_DOCTOR: Doctor = { ...PICKER_DOCTOR, id: 'doctor-2', displayName: 'Dra. Otra' };
      const { fixture, appointmentsService } = setup(
        [DOCTOR_SUMMARY],
        [PICKER_DOCTOR, OTHER_PICKER_DOCTOR],
      );
      await settle(fixture);

      el<HTMLButtonElement>(fixture, '.admin-doctors__header-actions .admin-doctors__btn--outline').click();
      await settle(fixture);

      const cards = allEls<HTMLButtonElement>(fixture, '.doctor-picker__card');
      cards[1].click();
      await settle(fixture);

      expect(appointmentsService.getAgenda).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: 'doctor-2' }),
      );
    });

    it('"Volver" returns to the doctors list', async () => {
      const { fixture } = setup();
      await settle(fixture);

      el<HTMLButtonElement>(fixture, '.admin-doctors__header-actions .admin-doctors__btn--outline').click();
      await settle(fixture);
      expect(el(fixture, '.admin-doctors__detail')).toBeTruthy();

      el<HTMLButtonElement>(fixture, '.admin-doctors__detail .admin-doctors__btn--ghost').click();
      await settle(fixture);

      expect(el(fixture, '.admin-doctors__table')).toBeTruthy();
    });
  });
});
