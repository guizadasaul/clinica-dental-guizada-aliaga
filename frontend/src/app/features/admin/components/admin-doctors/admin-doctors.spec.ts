import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { AdminDoctorsComponent } from './admin-doctors';
import { AdminDoctorsService } from '../../services/admin-doctors.service';
import type { AdminDoctorDetail, AdminDoctorSummary } from '../../models/admin-doctor.model';

const DOCTOR_SUMMARY: AdminDoctorSummary = {
  id: 'doctor-1',
  displayName: 'Juan Perez',
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

function setup(doctors: AdminDoctorSummary[] = [DOCTOR_SUMMARY]) {
  const adminDoctorsService = {
    getAll: vi.fn().mockReturnValue(of(doctors)),
    getById: vi.fn().mockReturnValue(of(DOCTOR_DETAIL)),
    create: vi.fn().mockReturnValue(of({ doctor: DOCTOR_DETAIL, inviteSent: true })),
    update: vi.fn().mockReturnValue(of(DOCTOR_DETAIL)),
    deactivate: vi.fn().mockReturnValue(of({ ...DOCTOR_DETAIL, isActive: false, isBookable: false })),
  };
  TestBed.configureTestingModule({
    imports: [AdminDoctorsComponent],
    providers: [
      { provide: AdminDoctorsService, useValue: adminDoctorsService },
      provideTranslateService({ defaultLanguage: 'es' }),
    ],
  });
  const fixture = TestBed.createComponent(AdminDoctorsComponent);
  return { fixture, adminDoctorsService };
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
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);
    await settle(fixture);

    expect(adminDoctorsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Dra. Maria Lopez', email: 'maria@example.com' }),
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
    await settle(fixture);

    submitForm(fixture);
    await settle(fixture);

    expect(el(fixture, '.admin-doctors__banner--error')?.textContent).toContain('Ya existe un usuario con ese email');
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
});
