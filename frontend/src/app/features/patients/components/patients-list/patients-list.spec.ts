import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
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
  phone: null,
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
      emergencyContactFirstName: null,
      emergencyContactLastName: null,
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
  const patientsService = {
    getAll: vi.fn().mockReturnValue(of(patients)),
    deletePatient: vi.fn().mockReturnValue(of(undefined)),
  };
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

  it('"Nuevo diagnóstico" vive en el menú ⋮, no en la fila, y emite el id del paciente (CLI-113)', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const emitted: string[] = [];
    fixture.componentInstance.newDiagnosis.subscribe((id) => emitted.push(id));

    const rowButtons = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.patients-list__btn')];
    expect(rowButtons.some((b) => b.textContent?.includes('Nuevo diagnóstico'))).toBe(false);

    el<HTMLButtonElement>(fixture, '.patients-list__menu-trigger').click();
    await settle(fixture);
    const items = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.patients-list__menu-item')];
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      expect.stringContaining('Nuevo diagnóstico'),
      expect.stringContaining('Corregir diagnóstico actual'),
      expect.stringContaining('Ver historia clínica'),
      expect.stringContaining('Registrar tratamiento'),
      expect.stringContaining('Hacer presupuesto'),
      expect.stringContaining('Eliminar paciente'),
    ]);

    items[0].click();
    await settle(fixture);
    expect(emitted).toEqual(['patient-1']);
    expect(el(fixture, '.patients-list__menu')).toBeFalsy();
  });
});

describe('PatientsListComponent — Nuevo paciente (CLI-171)', () => {
  it('el botón "Nuevo paciente" emite newPatient, para alguien que llegó sin reserva', async () => {
    const { fixture } = setup();
    let emitted = 0;
    fixture.componentInstance.newPatient.subscribe(() => emitted++);
    fixture.detectChanges();
    await fixture.whenStable();

    el<HTMLButtonElement>(fixture, '.patients-list__new-btn').click();

    expect(emitted).toBe(1);
  });

  it('también está con la lista vacía: ahí es justo cuando más hace falta', async () => {
    const { fixture } = setup([]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el(fixture, '.patients-list__new-btn')).not.toBeNull();
  });

  it('en modo solo lectura (admin viendo a un doctor) no aparece', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el(fixture, '.patients-list__new-btn')).toBeNull();
  });
});

describe('PatientsListComponent — búsqueda, acciones y menú', () => {
  function type(fixture: ReturnType<typeof setup>['fixture'], value: string): void {
    const search = el<HTMLInputElement>(fixture, '.patients-list__search');
    search.value = value;
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function rows(fixture: ReturnType<typeof setup>['fixture']): HTMLElement[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.patients-list__row')];
  }

  function rowButton(fixture: ReturnType<typeof setup>['fixture'], label: string): HTMLButtonElement {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.patients-list__btn')].find(
      (b) => b.textContent?.includes(label),
    )!;
  }

  const WITH_MATERNAL = fakePatientWithUser({
    userId: 'user-2',
    patient: { ...fakePatientWithUser().patient!, id: 'patient-2', firstName: 'Luis', lastNameMaternal: 'Rojas', phone: '79999999' },
  });
  const WITHOUT_RECORD = fakePatientWithUser({ userId: 'user-3', patient: null, displayName: null, phone: null });

  it('busca por nombre completo o por teléfono, sin importar mayúsculas', async () => {
    const { fixture } = setup([fakePatientWithUser(), WITH_MATERNAL]);
    await settle(fixture);

    type(fixture, '  ROJAS ');
    expect(rows(fixture)).toHaveLength(1);
    expect(rows(fixture)[0].textContent).toContain('Luis Perez Rojas');

    type(fixture, '7001');
    expect(rows(fixture)[0].textContent).toContain('Juana');

    type(fixture, 'nadie');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No se encontraron pacientes');
  });

  it('sin pacientes muestra el estado vacío', async () => {
    const { fixture } = setup([]);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No hay pacientes registrados aún');
  });

  it('un usuario sin ficha aparece como "Sin nombre", sin teléfono, y se le puede crear la ficha', async () => {
    const { fixture } = setup([WITHOUT_RECORD]);
    await settle(fixture);
    const started: string[] = [];
    fixture.componentInstance.startWizard.subscribe((id) => started.push(id));

    expect(rows(fixture)[0].textContent).toContain('Sin nombre');
    expect(rows(fixture)[0].textContent).toContain('—');
    rowButton(fixture, 'Registrar').click();

    expect(started).toEqual(['user-3']);
  });

  it('sin diagnóstico ni cuenta ofrece registrar el diagnóstico y mandar la invitación', async () => {
    const patient = fakePatientWithUser({ dentalExamsCount: 0, hasAccount: false });
    const { fixture } = setup([patient]);
    await settle(fixture);
    const diagnosed: unknown[] = [];
    const invited: unknown[] = [];
    fixture.componentInstance.registerDiagnosis.subscribe((p) => diagnosed.push(p));
    fixture.componentInstance.sendInvite.subscribe((c) => invited.push(c));

    rowButton(fixture, 'Registrar diagnóstico').click();
    rowButton(fixture, 'Enviar registro').click();

    expect(diagnosed).toEqual([patient.patient]);
    expect(invited).toEqual([
      { patientId: 'patient-1', firstName: 'Juana', lastNamePaternal: 'Perez', phone: '70011122', email: 'juana@example.com' },
    ]);
  });

  it('con diagnóstico y cuenta ofrece tratamiento, historial y presupuesto', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const events: string[] = [];
    fixture.componentInstance.registerTreatment.subscribe((id) => events.push(`tratamiento:${id}`));
    fixture.componentInstance.viewHistory.subscribe((id) => events.push(`historial:${id}`));
    fixture.componentInstance.buildQuote.subscribe((id) => events.push(`presupuesto:${id}`));

    rowButton(fixture, 'Tratamiento').click();
    rowButton(fixture, 'Historial').click();
    rowButton(fixture, 'Presupuesto').click();

    expect(events).toEqual(['tratamiento:patient-1', 'historial:patient-1', 'presupuesto:patient-1']);
  });

  it('en modo solo lectura no muestra acciones', async () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('readOnly', true);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('.patients-list__btn')).toBeNull();
  });

  it('con un doctor forzado (panel de admin) lista solo sus pacientes', async () => {
    const { fixture, patientsService } = setup();
    fixture.componentRef.setInput('forcedDoctorId', 'doctor-b');
    await settle(fixture);

    expect(patientsService.getAll).toHaveBeenLastCalledWith('doctor-b');
  });

  it('si los doctores no cargan, los pacientes quedan "Sin asignar"', async () => {
    const { fixture, bookingService } = setup();
    bookingService.getDoctors.mockReturnValue(throwError(() => new Error('500')));
    await settle(fixture);

    expect(rows(fixture)[0].textContent).toContain('Sin asignar');
  });

  // CLI-184: eliminar un paciente (baja lógica).
  describe('eliminar paciente (CLI-184)', () => {
    function menuItems(fixture: ReturnType<typeof setup>['fixture']): HTMLElement[] {
      return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.patients-list__menu-item')];
    }

    async function openDialog(patients: PatientWithUser[] = [fakePatientWithUser()]) {
      const context = setup(patients);
      await settle(context.fixture);
      el<HTMLButtonElement>(context.fixture, '.patients-list__menu-trigger').click();
      await settle(context.fixture);
      menuItems(context.fixture).find((i) => i.textContent?.includes('Eliminar paciente'))!.click();
      await settle(context.fixture);
      return context;
    }

    function typeWord(fixture: ReturnType<typeof setup>['fixture'], value: string): void {
      const input = el<HTMLInputElement>(fixture, '#delete-modal-confirm');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    const confirmButton = (fixture: ReturnType<typeof setup>['fixture']) =>
      el<HTMLButtonElement>(fixture, '.delete-modal__btn--danger');

    it('todas las filas tienen el menú ⋮, también una persona sin ficha, con tratamiento y presupuesto deshabilitados', async () => {
      const { fixture } = setup([
        fakePatientWithUser(),
        fakePatientWithUser({ userId: 'user-3', patient: null, displayName: null }),
      ]);
      await settle(fixture);

      const triggers = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.patients-list__menu-trigger');
      expect(triggers).toHaveLength(2);
      triggers[1].click();
      await settle(fixture);
      expect(menuItems(fixture).map((i) => i.textContent?.trim())).toEqual([
        expect.stringContaining('Registrar tratamiento'),
        expect.stringContaining('Hacer presupuesto'),
        expect.stringContaining('Eliminar paciente'),
      ]);
      const [treatment, quote] = menuItems(fixture) as HTMLButtonElement[];
      expect(treatment.disabled).toBe(true);
      expect(quote.disabled).toBe(true);
    });

    it('en modo solo lectura (panel de admin) no hay menú ni opción de eliminar', async () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('readOnly', true);
      await settle(fixture);

      expect(el(fixture, '.patients-list__menu-trigger')).toBeNull();
    });

    it('abre la alerta con el nombre del paciente y cierra el menú', async () => {
      const { fixture } = await openDialog();

      expect(el(fixture, '.patients-list__menu')).toBeNull();
      expect(el(fixture, '.delete-modal__text')?.textContent).toContain('Juana Perez');
      expect(confirmButton(fixture).disabled).toBe(true);
    });

    it('nombra al paciente con el nombre de la ficha, no con el de la cuenta', async () => {
      const { fixture } = await openDialog([fakePatientWithUser({ displayName: 'Saul Ariel Guizada Aliaga' })]);

      const text = el(fixture, '.delete-modal__text')?.textContent ?? '';
      expect(text).toContain('Juana Perez');
      expect(text).not.toContain('Saul Ariel');
    });

    it('solo se habilita al escribir "eliminar" (sin importar mayúsculas ni espacios)', async () => {
      const { fixture } = await openDialog();

      typeWord(fixture, 'elimin');
      expect(confirmButton(fixture).disabled).toBe(true);
      typeWord(fixture, '  ELIMINAR ');
      expect(confirmButton(fixture).disabled).toBe(false);
    });

    it('al confirmar da de baja al paciente, cierra la alerta y recarga la lista', async () => {
      const { fixture, patientsService } = await openDialog();
      typeWord(fixture, 'eliminar');

      el<HTMLFormElement>(fixture, '.delete-modal form').dispatchEvent(new Event('submit'));
      await settle(fixture);

      expect(patientsService.deletePatient).toHaveBeenCalledWith('user-1');
      expect(patientsService.getAll).toHaveBeenCalledTimes(2);
      expect(el(fixture, '.delete-modal')).toBeNull();
    });

    it('sin escribir la palabra no elimina aunque se envíe el formulario', async () => {
      const { fixture, patientsService } = await openDialog();

      el<HTMLFormElement>(fixture, '.delete-modal form').dispatchEvent(new Event('submit'));
      await settle(fixture);

      expect(patientsService.deletePatient).not.toHaveBeenCalled();
    });

    it('si la API rechaza la baja (citas, saldo) muestra el motivo y deja la alerta abierta', async () => {
      const { fixture, patientsService } = await openDialog();
      patientsService.deletePatient.mockReturnValue(
        throwError(() => ({ error: { message: 'No se puede eliminar a Juana Perez: tiene 1 cita pendiente.' } })),
      );
      typeWord(fixture, 'eliminar');

      el<HTMLFormElement>(fixture, '.delete-modal form').dispatchEvent(new Event('submit'));
      await settle(fixture);

      expect(el(fixture, '.delete-modal__error')?.textContent).toContain('tiene 1 cita pendiente');
      expect(patientsService.getAll).toHaveBeenCalledTimes(1);
    });

    it('un error sin mensaje usable muestra uno genérico', async () => {
      const { fixture, patientsService } = await openDialog();
      patientsService.deletePatient.mockReturnValue(throwError(() => new Error('red')));
      typeWord(fixture, 'eliminar');

      el<HTMLFormElement>(fixture, '.delete-modal form').dispatchEvent(new Event('submit'));
      await settle(fixture);

      expect(el(fixture, '.delete-modal__error')?.textContent).toContain('No se pudo eliminar');
    });

    it('"Cancelar", Escape y el fondo cierran la alerta sin eliminar', async () => {
      const { fixture, patientsService } = await openDialog();

      el<HTMLButtonElement>(fixture, '.delete-modal__btn--ghost').click();
      await settle(fixture);
      expect(el(fixture, '.delete-modal')).toBeNull();

      el<HTMLButtonElement>(fixture, '.patients-list__menu-trigger').click();
      await settle(fixture);
      menuItems(fixture).at(-1)!.click();
      await settle(fixture);
      el<HTMLElement>(fixture, '.delete-modal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle(fixture);
      expect(el(fixture, '.delete-modal')).toBeNull();

      el<HTMLButtonElement>(fixture, '.patients-list__menu-trigger').click();
      await settle(fixture);
      menuItems(fixture).at(-1)!.click();
      await settle(fixture);
      el<HTMLElement>(fixture, '.delete-modal').click();
      await settle(fixture);
      expect(el(fixture, '.delete-modal')).toBeNull();
      expect(patientsService.deletePatient).not.toHaveBeenCalled();
    });
  });

  // CLI-189: tratamiento y presupuesto solo después de terminar el diagnóstico.
  describe('tratamiento y presupuesto desde el menú ⋮ (CLI-189)', () => {
    async function openRowMenu(patients: PatientWithUser[], row = 0) {
      const context = setup(patients);
      await settle(context.fixture);
      const triggers = (context.fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.patients-list__menu-trigger',
      );
      triggers[row].click();
      await settle(context.fixture);
      const items = [
        ...(context.fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.patients-list__menu-item'),
      ];
      const byLabel = (label: string) => items.find((i) => i.textContent?.includes(label))!;
      return { ...context, byLabel };
    }

    const NO_DIAGNOSIS = fakePatientWithUser({ dentalExamsCount: 0 });

    it('sin diagnóstico quedan deshabilitados, con la pista, y no emiten nada', async () => {
      const { fixture, byLabel } = await openRowMenu([NO_DIAGNOSIS]);
      const emitted: string[] = [];
      fixture.componentInstance.registerTreatment.subscribe((id) => emitted.push(`t:${id}`));
      fixture.componentInstance.buildQuote.subscribe((id) => emitted.push(`q:${id}`));

      expect(byLabel('Registrar tratamiento').disabled).toBe(true);
      expect(byLabel('Hacer presupuesto').disabled).toBe(true);
      expect(el(fixture, '.patients-list__menu-hint')?.textContent).toContain('terminar el diagnóstico');
      byLabel('Registrar tratamiento').click();
      byLabel('Hacer presupuesto').click();
      expect(emitted).toEqual([]);
    });

    it('con diagnóstico se habilitan, sin pista, y emiten el id de la ficha', async () => {
      const { fixture, byLabel } = await openRowMenu([fakePatientWithUser()]);
      const emitted: string[] = [];
      fixture.componentInstance.registerTreatment.subscribe((id) => emitted.push(`t:${id}`));
      fixture.componentInstance.buildQuote.subscribe((id) => emitted.push(`q:${id}`));

      expect(byLabel('Registrar tratamiento').disabled).toBe(false);
      expect(el(fixture, '.patients-list__menu-hint')).toBeNull();
      byLabel('Registrar tratamiento').click();
      fixture.detectChanges();
      el<HTMLButtonElement>(fixture, '.patients-list__menu-trigger').click();
      fixture.detectChanges();
      [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.patients-list__menu-item')]
        .find((i) => i.textContent?.includes('Hacer presupuesto'))!
        .click();
      fixture.detectChanges();

      expect(emitted).toEqual(['t:patient-1', 'q:patient-1']);
      expect(el(fixture, '.patients-list__menu')).toBeNull();
    });

    it('un paciente pendiente de cuenta con diagnóstico también puede (no depende de la cuenta)', async () => {
      const { byLabel } = await openRowMenu([fakePatientWithUser({ hasAccount: false })]);

      expect(byLabel('Registrar tratamiento').disabled).toBe(false);
      expect(byLabel('Hacer presupuesto').disabled).toBe(false);
    });
  });

  describe('menú ⋮', () => {
    async function openMenu() {
      const context = setup();
      await settle(context.fixture);
      const trigger = el<HTMLButtonElement>(context.fixture, '.patients-list__menu-trigger');
      vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ bottom: 100, right: 900 } as DOMRect);
      Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
      trigger.click();
      context.fixture.detectChanges();
      return { ...context, trigger };
    }

    it('se abre debajo del botón, alineado a su borde derecho', async () => {
      const { fixture } = await openMenu();

      const menu = el<HTMLElement>(fixture, '.patients-list__menu');
      expect(menu.style.top).toBe('108px');
      expect(menu.style.right).toBe('100px');
    });

    it('el mismo botón lo cierra', async () => {
      const { fixture, trigger } = await openMenu();

      trigger.click();
      fixture.detectChanges();

      expect(el(fixture, '.patients-list__menu')).toBeNull();
    });

    it('se cierra al hacer click afuera o al scrollear, no al hacer click adentro', async () => {
      const { fixture } = await openMenu();

      el(fixture, '.patients-list__menu-wrap').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(el(fixture, '.patients-list__menu')).not.toBeNull();

      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(el(fixture, '.patients-list__menu')).toBeNull();

      el<HTMLButtonElement>(fixture, '.patients-list__menu-trigger').click();
      fixture.detectChanges();
      window.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
      expect(el(fixture, '.patients-list__menu')).toBeNull();
    });

    it('scrollear sin menú abierto no hace nada', async () => {
      const { fixture } = setup();
      await settle(fixture);

      window.dispatchEvent(new Event('scroll'));

      expect(el(fixture, '.patients-list__menu')).toBeNull();
    });

    it('"Corregir diagnóstico actual" y "Ver historia clínica" emiten y cierran el menú', async () => {
      const { fixture } = await openMenu();
      const events: unknown[] = [];
      fixture.componentInstance.openOdontogram.subscribe((id) => events.push(id));
      fixture.componentInstance.viewClinicalRecord.subscribe((p) => events.push(p.id));
      const items = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.patients-list__menu-item')];

      items()[1].click();
      fixture.detectChanges();
      el<HTMLButtonElement>(fixture, '.patients-list__menu-trigger').click();
      fixture.detectChanges();
      items()[2].click();
      fixture.detectChanges();

      expect(events).toEqual(['patient-1', 'patient-1']);
      expect(el(fixture, '.patients-list__menu')).toBeNull();
    });
  });
});
