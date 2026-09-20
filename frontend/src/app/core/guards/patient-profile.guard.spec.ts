import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, UrlTree, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { of } from 'rxjs';
import { patientProfileGuard } from './patient-profile.guard';
import { AuthService } from '../../auth/application/auth.service';
import { PatientsService } from '../../features/patients/services/patients.service';

type Role = 'odontologist' | 'admin' | 'patient' | null;

function setup(role: Role, patientExists = false) {
  const events: string[] = [];
  const authService = {
    authReady: Promise.resolve().then(() => {
      events.push('authReady');
    }),
    waitForSync: vi.fn().mockImplementation(async () => {
      events.push('waitForSync');
    }),
    currentUser: signal(role ? { uid: 'uid', id: 'user-1', email: null, displayName: null, photoURL: null, role } : null),
  };
  const patientsService = { getMyPatientStatus: vi.fn().mockReturnValue(of({ exists: patientExists })) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: authService },
      { provide: PatientsService, useValue: patientsService },
    ],
  });
  const run = () =>
    TestBed.runInInjectionContext(() =>
      patientProfileGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  return { run, patientsService, authService, events };
}

describe('patientProfileGuard', () => {
  // CLI-79: un doctor recién invitado no tiene ficha de paciente, y aun así
  // tiene que aterrizar en su dashboard después de canjear el link.
  it('lets an odontologist in without asking for a patient profile', async () => {
    const { run, patientsService } = setup('odontologist');

    expect(await run()).toBe(true);
    expect(patientsService.getMyPatientStatus).not.toHaveBeenCalled();
  });

  it('lets the admin in without asking for a patient profile', async () => {
    const { run, patientsService } = setup('admin');

    expect(await run()).toBe(true);
    expect(patientsService.getMyPatientStatus).not.toHaveBeenCalled();
  });

  it('lets a patient in when they already have a patient profile', async () => {
    const { run, patientsService } = setup('patient', true);

    expect(await run()).toBe(true);
    expect(patientsService.getMyPatientStatus).toHaveBeenCalled();
  });

  it('sends a patient without a profile to the landing with ?sinFicha=1', async () => {
    const { run } = setup('patient', false);

    const result = await run();

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/?sinFicha=1');
  });

  it('waits for the session and for the pending sync before reading the role (a login that just happened in this same session)', async () => {
    const { run, events } = setup('odontologist');

    await run();

    expect(events).toEqual(['authReady', 'waitForSync']);
  });
});
