import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { PatientWizardComponent } from './patient-wizard';
import { PatientsService } from '../../services/patients.service';
import { DiagnosesService } from '../../../diagnoses/services/diagnoses.service';
import { MedicalConditionsService } from '../../../medical-conditions/services/medical-conditions.service';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';

// Cada paso tiene su propio spec; acá se prueba el recorrido del wizard.
@Component({ selector: 'app-step-patient-data', standalone: true, template: 'paso 1' })
class Step1Stub {
  readonly loading = input(false);
  readonly existingPatient = input<unknown>(null);
  readonly submitStep = output<unknown>();
}
@Component({ selector: 'app-step-medical-history', standalone: true, template: 'paso 2' })
class Step2Stub {
  readonly loading = input(false);
  readonly catalog = input<unknown[]>([]);
  readonly submitStep = output<unknown>();
  readonly back = output<void>();
}
@Component({ selector: 'app-step-oral-hygiene', standalone: true, template: 'paso 3' })
class Step3Stub {
  readonly loading = input(false);
  readonly submitStep = output<unknown>();
  readonly back = output<void>();
}
@Component({ selector: 'app-step-odontogram', standalone: true, template: 'paso 4' })
class Step4Stub {
  readonly loading = input(false);
  readonly mode = input('correct');
  readonly catalog = input<unknown[]>([]);
  readonly currentExam = input<unknown>(null);
  readonly versions = input<unknown[]>([]);
  readonly patientId = input<string | null>(null);
  readonly submitStep = output<unknown>();
  readonly closeWithoutChanges = output<void>();
  readonly back = output<void>();
}

function httpError(message: unknown) {
  return throwError(() => ({ error: { message } }));
}

function setup(inputs: Record<string, unknown> = {}) {
  const patients = {
    createPatient: vi.fn().mockReturnValue(of({ id: 'patient-new' })),
    updatePatient: vi.fn().mockReturnValue(of({ id: 'patient-1' })),
    createMedicalHistory: vi.fn().mockReturnValue(of({})),
    createHygieneHabits: vi.fn().mockReturnValue(of({})),
    createClinicalExam: vi.fn().mockReturnValue(of({})),
    createDentalExam: vi.fn().mockReturnValue(of({})),
    getCurrentDentalExam: vi.fn().mockReturnValue(of({ id: 'exam-1' })),
    getDentalExamVersions: vi.fn().mockReturnValue(of([{ id: 'exam-1' }])),
  };
  const diagnoses = { getCatalog: vi.fn().mockReturnValue(of([{ id: 'cat-1' }])) };
  const conditions = { getCatalog: vi.fn().mockReturnValue(of([{ id: 'cond-1' }])) };
  TestBed.configureTestingModule({
    imports: [PatientWizardComponent],
    providers: [
      { provide: PatientsService, useValue: patients },
      { provide: DiagnosesService, useValue: diagnoses },
      { provide: MedicalConditionsService, useValue: conditions },
    ],
  });
  TestBed.overrideComponent(PatientWizardComponent, {
    set: { imports: [PageHeaderComponent, Step1Stub, Step2Stub, Step3Stub, Step4Stub] },
  });
  const fixture = TestBed.createComponent(PatientWizardComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  const events = { complete: 0, cancelled: 0 };
  fixture.componentInstance.wizardComplete.subscribe(() => events.complete++);
  fixture.componentInstance.cancelled.subscribe(() => events.cancelled++);
  return { fixture, patients, diagnoses, conditions, events };
}

/** Las cargas encadenan varios await (Promise.all de firstValueFrom): hay que dejarlas terminar. */
async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

function step<T>(fixture: ReturnType<typeof setup>['fixture'], type: new (...args: never[]) => T): T {
  return fixture.debugElement.query(By.directive(type)).componentInstance as T;
}

function text(fixture: ReturnType<typeof setup>['fixture']): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('PatientWizardComponent', () => {
  describe('alta completa de un paciente nuevo', () => {
    it('recorre los 4 pasos guardando cada uno y termina con la ficha registrada', async () => {
      const { fixture, patients, events } = setup({ userId: 'user-1' });
      await settle(fixture);
      expect(text(fixture)).toContain('Registro de nuevo paciente');
      expect(text(fixture)).toContain('Paso 1 de 4');

      step(fixture, Step1Stub).submitStep.emit({ firstName: 'Ana' });
      await settle(fixture);
      expect(patients.createPatient).toHaveBeenCalledWith({ firstName: 'Ana', userId: 'user-1' });
      expect(text(fixture)).toContain('Paso 2 de 4');
      expect(step(fixture, Step2Stub).catalog()).toEqual([{ id: 'cond-1' }]);

      step(fixture, Step2Stub).submitStep.emit({ conditions: [] });
      await settle(fixture);
      expect(patients.createMedicalHistory).toHaveBeenCalledWith('patient-new', { conditions: [] });

      step(fixture, Step3Stub).submitStep.emit({ hygieneHabits: { a: 1 }, clinicalExam: { b: 2 } });
      await settle(fixture);
      expect(patients.createHygieneHabits).toHaveBeenCalledWith('patient-new', { a: 1 });
      expect(patients.createClinicalExam).toHaveBeenCalledWith('patient-new', { b: 2 });
      expect(step(fixture, Step4Stub).catalog()).toEqual([{ id: 'cat-1' }]);

      step(fixture, Step4Stub).submitStep.emit({ findings: [] });
      await settle(fixture);
      expect(patients.createDentalExam).toHaveBeenCalledWith('patient-new', { findings: [] });
      expect(text(fixture)).toContain('¡Ficha registrada correctamente!');

      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.wizard__success-btn')!.click();
      expect(events.complete).toBe(1);
    });

    it('marca los pasos completados en la barra de progreso', async () => {
      const { fixture } = setup({ userId: 'user-1' });
      await settle(fixture);

      step(fixture, Step1Stub).submitStep.emit({});
      await settle(fixture);

      const steps = (fixture.nativeElement as HTMLElement).querySelectorAll('li.wizard__step');
      expect(steps[0].classList).toContain('wizard__step--done');
      expect(steps[1].classList).toContain('wizard__step--active');
    });

    it('"atrás" vuelve al paso anterior', async () => {
      const { fixture } = setup({ userId: 'user-1' });
      await settle(fixture);
      step(fixture, Step1Stub).submitStep.emit({});
      await settle(fixture);

      step(fixture, Step2Stub).back.emit();
      fixture.detectChanges();

      expect(text(fixture)).toContain('Paso 1 de 4');
    });

    it('los pasos 2 a 4 no guardan nada si todavía no hay paciente', async () => {
      const { fixture, patients } = setup({ userId: 'user-1' });
      const wizard = fixture.componentInstance as unknown as Record<string, (data: unknown) => Promise<void>>;

      await wizard['onStep2Submit']({});
      await wizard['onStep3Submit']({ hygieneHabits: {}, clinicalExam: {} });
      await wizard['onStep4Submit']({});

      expect(patients.createMedicalHistory).not.toHaveBeenCalled();
      expect(patients.createHygieneHabits).not.toHaveBeenCalled();
      expect(patients.createDentalExam).not.toHaveBeenCalled();
    });

    it('"atrás" en el primer paso no hace nada', async () => {
      const { fixture } = setup({ userId: 'user-1' });
      await settle(fixture);

      (fixture.componentInstance as unknown as { goBack(): void }).goBack();
      fixture.detectChanges();

      expect(text(fixture)).toContain('Paso 1 de 4');
    });
  });

  describe('errores del backend', () => {
    it.each([
      ['el mensaje del backend', 'El DNI ya está registrado', 'El DNI ya está registrado'],
      ['las reglas de class-validator unidas', ['firstName es obligatorio', '', 'dni inválido'], 'firstName es obligatorio dni inválido'],
      ['el genérico si el mensaje viene vacío', '   ', 'Error al guardar los datos del paciente'],
      ['el genérico si la lista viene vacía', [''], 'Error al guardar los datos del paciente'],
      ['el genérico si el mensaje no es texto', 42, 'Error al guardar los datos del paciente'],
    ])('en el paso 1 muestra %s', async (_, message, expected) => {
      const { fixture, patients } = setup({ userId: 'user-1' });
      patients.createPatient.mockReturnValue(httpError(message));
      await settle(fixture);

      step(fixture, Step1Stub).submitStep.emit({});
      await settle(fixture);

      expect((fixture.nativeElement as HTMLElement).querySelector('.wizard__error')?.textContent).toContain(expected);
      expect(text(fixture)).toContain('Paso 1 de 4');
    });

    it.each([
      [null],
      ['texto plano'],
      [{ error: null }],
      [{ error: { sinMessage: true } }],
    ])('un error sin cuerpo usable (%o) muestra el genérico', async (err) => {
      const { fixture, patients } = setup({ userId: 'user-1' });
      patients.createPatient.mockReturnValue(throwError(() => err));
      await settle(fixture);

      step(fixture, Step1Stub).submitStep.emit({});
      await settle(fixture);

      expect(text(fixture)).toContain('Error al guardar los datos del paciente');
    });

    it.each([
      [2, 'createMedicalHistory', 'Error al guardar el historial médico'],
      [3, 'createHygieneHabits', 'Error al guardar la higiene bucal'],
      [4, 'createDentalExam', 'Error al guardar el examen dental'],
    ] as const)('si falla el paso %i, se queda ahí con su error', async (n, method, message) => {
      const { fixture, patients } = setup({ existingPatientId: 'patient-1', startStep: n });
      patients[method].mockReturnValue(throwError(() => new Error('500')));
      await settle(fixture);

      const stub = [Step2Stub, Step3Stub, Step4Stub][n - 2] as new () => { submitStep: { emit(v: unknown): void } };
      step(fixture, stub).submitStep.emit({ hygieneHabits: {}, clinicalExam: {} });
      await settle(fixture);

      expect(text(fixture)).toContain(message);
    });
  });

  describe('paciente existente', () => {
    it('por defecto abre el examen dental para corregir el vigente, con sus versiones', async () => {
      const { fixture, patients } = setup({ existingPatientId: 'patient-1' });
      await settle(fixture);

      expect(text(fixture)).toContain('Corregir diagnóstico');
      expect(patients.getCurrentDentalExam).toHaveBeenCalledWith('patient-1');
      const odontogram = step(fixture, Step4Stub);
      expect(odontogram.currentExam()).toEqual({ id: 'exam-1' });
      expect(odontogram.versions()).toEqual([{ id: 'exam-1' }]);
      expect(odontogram.patientId()).toBe('patient-1');
      // Entrando directo al examen no se muestra la barra de pasos.
      expect((fixture.nativeElement as HTMLElement).querySelector('.wizard__progress')).toBeNull();
    });

    it('"Nuevo diagnóstico" arranca en blanco y al guardar lo confirma como diagnóstico', async () => {
      const { fixture } = setup({ existingPatientId: 'patient-1', examMode: 'new' });
      await settle(fixture);
      expect(text(fixture)).toContain('Nuevo diagnóstico');
      expect(step(fixture, Step4Stub).mode()).toBe('new');

      step(fixture, Step4Stub).submitStep.emit({});
      await settle(fixture);

      expect(text(fixture)).toContain('¡Diagnóstico guardado!');
    });

    it('cerrar el examen sin cambios cancela el wizard', async () => {
      const { fixture, events } = setup({ existingPatientId: 'patient-1' });
      await settle(fixture);

      step(fixture, Step4Stub).closeWithoutChanges.emit();

      expect(events.cancelled).toBe(1);
    });

    it('"Registrar diagnóstico" edita la ficha existente desde el paso 1', async () => {
      const patient = { id: 'patient-1', firstName: 'Ana' };
      const { fixture, patients } = setup({ existingPatientId: 'patient-1', existingPatient: patient, startStep: 1 });
      await settle(fixture);
      expect(text(fixture)).toContain('Registrar diagnóstico');
      expect(step(fixture, Step1Stub).existingPatient()).toBe(patient);

      step(fixture, Step1Stub).submitStep.emit({ firstName: 'Ana María' });
      await settle(fixture);

      expect(patients.updatePatient).toHaveBeenCalledWith('patient-1', { firstName: 'Ana María' });
      expect(patients.createPatient).not.toHaveBeenCalled();
    });

    it('desde la agenda abre el historial clínico (paso 2)', async () => {
      const { fixture } = setup({ existingPatientId: 'patient-1', startStep: 2 });
      await settle(fixture);

      expect(text(fixture)).toContain('Completar historial clínico');
      expect(text(fixture)).toContain('Paso 2 de 4');
    });

    it('si el examen previo no carga, arranca sin él', async () => {
      const { fixture, patients } = setup({ existingPatientId: 'patient-1' });
      patients.getCurrentDentalExam.mockReturnValue(throwError(() => new Error('404')));
      await settle(fixture);

      expect(step(fixture, Step4Stub).currentExam()).toBeNull();
    });
  });

  it('si los catálogos no cargan, los pasos arrancan sin opciones', async () => {
    const { fixture, diagnoses, conditions } = setup({ existingPatientId: 'patient-1' });
    diagnoses.getCatalog.mockReturnValue(throwError(() => new Error('500')));
    conditions.getCatalog.mockReturnValue(throwError(() => new Error('500')));
    await settle(fixture);

    expect(step(fixture, Step4Stub).catalog()).toEqual([]);
  });

  it('volver a la lista desde el encabezado cancela', async () => {
    const { fixture, events } = setup({ userId: 'user-1' });
    await settle(fixture);

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('app-page-header button')!.click();

    expect(events.cancelled).toBe(1);
  });
});
