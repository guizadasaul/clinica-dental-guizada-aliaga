import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { PatientsListComponent } from './patients-list';
import { PatientsService } from '../../services/patients.service';
import { BookingService } from '../../../booking/services/booking.service';
import { AuthService } from '../../../../auth/application/auth.service';
import type { PatientWithUser } from '../../models/patient.model';
import type { Doctor } from '../../../booking/models/booking.model';
import type { AuthenticatedUser } from '../../../../auth/models/authenticated-user.model';

const DOCTOR_A: Doctor = {
  id: 'doctor-a',
  displayName: 'Dr. Ariel',
  specialty: null,
  bio: null,
  photoUrl: null,
  displayOrder: 0,
  isBookable: true,
};
const DOCTOR_B: Doctor = { ...DOCTOR_A, id: 'doctor-b', displayName: 'Dra. Marylu' };

function fakePatientWithUser(overrides: Partial<PatientWithUser> = {}): PatientWithUser {
  return {
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
      assignedDoctorId: 'doctor-a',
    },
    ...overrides,
  };
}

function createAuthServiceStub(user: Partial<AuthenticatedUser> | null = { id: 'doctor-a' }) {
  return {
    currentUser: signal(
      user
        ? {
            uid: 'auth-uid',
            id: null,
            email: null,
            displayName: null,
            photoURL: null,
            role: 'odontologist',
            ...user,
          }
        : null,
    ),
  };
}

function setup(
  patients: PatientWithUser[] = [fakePatientWithUser()],
  doctors: Doctor[] = [DOCTOR_A, DOCTOR_B],
  authService = createAuthServiceStub(),
) {
  const patientsService = { getAll: vi.fn().mockReturnValue(of(patients)) };
  const bookingService = { getDoctors: vi.fn().mockReturnValue(of(doctors)) };
  TestBed.configureTestingModule({
    imports: [PatientsListComponent],
    providers: [
      { provide: PatientsService, useValue: patientsService },
      { provide: BookingService, useValue: bookingService },
      { provide: AuthService, useValue: authService },
    ],
  });
  const fixture = TestBed.createComponent(PatientsListComponent);
  return { fixture, patientsService, bookingService };
}

function el<T extends Element>(fixture: ReturnType<typeof setup>['fixture'], selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('PatientsListComponent', () => {
  it('shows the assigned doctor name resolved from GET /public/doctors', async () => {
    const { fixture } = setup();
    await settle(fixture);

    expect(el(fixture, '.patients-list__cell:nth-child(3)')?.textContent).toContain('Dr. Ariel');
  });

  it('shows "Sin asignar" when the patient has no assigned doctor', async () => {
    const { fixture } = setup([
      fakePatientWithUser({
        patient: { ...fakePatientWithUser().patient!, assignedDoctorId: null },
      }),
    ]);
    await settle(fixture);

    expect(el(fixture, '.patients-list__cell:nth-child(3)')?.textContent).toContain('Sin asignar');
  });

  it('loads all patients by default (visibilidad compartida)', async () => {
    const { fixture, patientsService } = setup();
    await settle(fixture);

    expect(patientsService.getAll).toHaveBeenCalledWith(undefined);
  });

  it('toggling "Los míos" reloads scoped to the authenticated doctor id', async () => {
    const { fixture, patientsService } = setup();
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.patients-list__owner-btn:last-child').click();
    await settle(fixture);

    expect(patientsService.getAll).toHaveBeenLastCalledWith('doctor-a');
  });

  it('toggling back to "Todos" reloads without a doctorId filter', async () => {
    const { fixture, patientsService } = setup();
    await settle(fixture);

    el<HTMLButtonElement>(fixture, '.patients-list__owner-btn:last-child').click();
    await settle(fixture);
    el<HTMLButtonElement>(fixture, '.patients-list__owner-btn:first-child').click();
    await settle(fixture);

    expect(patientsService.getAll).toHaveBeenLastCalledWith(undefined);
  });

  it('"Nuevo diagnóstico" emite el id del paciente y el menú ofrece corregir el vigente (CLI-109)', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const emitted: string[] = [];
    fixture.componentInstance.newDiagnosis.subscribe((id) => emitted.push(id));

    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.patients-list__btn')];
    buttons.find((b) => b.textContent?.includes('Nuevo diagnóstico'))!.click();
    expect(emitted).toEqual(['patient-1']);

    el<HTMLButtonElement>(fixture, '.patients-list__menu-trigger').click();
    await settle(fixture);
    expect(el(fixture, '.patients-list__menu')?.textContent).toContain('Corregir diagnóstico actual');
  });
});
