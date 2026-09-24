import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { RegisterTreatmentComponent } from './register-treatment';
import { TreatmentsService } from '../../services/treatments.service';
import { PatientsService } from '../../../patients/services/patients.service';
import { DiagnosesService } from '../../../diagnoses/services/diagnoses.service';
import { PageHeaderComponent } from '../../../../shared/ui/page-header/page-header';
import type { ProcedureRegisteredEvent } from '../register-treatment-odontogram/register-treatment-odontogram';
import type { ToothProcedure } from '../../models/treatment.model';

// El odontograma de tratamientos tiene su propio spec.
@Component({ selector: 'app-register-treatment-odontogram', standalone: true, template: '' })
class OdontogramStub {
  readonly patientId = input('');
  readonly treatments = input<unknown[]>([]);
  readonly catalog = input<unknown[]>([]);
  readonly currentExam = input<unknown>(null);
  readonly procedures = input<ToothProcedure[]>([]);
  readonly procedureRegistered = output<ProcedureRegisteredEvent>();
}

const proc = (overrides: Partial<ToothProcedure> = {}) =>
  ({ id: 'p1', toothNumber: 16, treatmentId: 'resina', priceCharged: 150, ...overrides }) as ToothProcedure;

function setup(fail = false) {
  const reply = <T>(value: T) => (fail ? throwError(() => new Error('500')) : of(value));
  TestBed.configureTestingModule({
    imports: [RegisterTreatmentComponent],
    providers: [
      {
        provide: TreatmentsService,
        useValue: {
          getAll: () => of([{ id: 'resina', name: 'Resina', currency: 'BOB' }, { id: 'carilla', name: 'Carilla', currency: 'USD' }]),
          getToothProcedures: () => reply([proc()]),
        },
      },
      { provide: PatientsService, useValue: { getCurrentDentalExam: () => reply({ id: 'exam-1' }) } },
      { provide: DiagnosesService, useValue: { getCatalog: () => of([{ id: 'cat-1' }]) } },
    ],
  });
  TestBed.overrideComponent(RegisterTreatmentComponent, { set: { imports: [PageHeaderComponent, OdontogramStub] } });
  const fixture = TestBed.createComponent(RegisterTreatmentComponent);
  fixture.componentRef.setInput('patientId', 'patient-1');
  fixture.detectChanges();
  const events = { done: 0, cancelled: 0 };
  fixture.componentInstance.done.subscribe(() => events.done++);
  fixture.componentInstance.cancelled.subscribe(() => events.cancelled++);
  const root = fixture.nativeElement as HTMLElement;
  const odontogram = fixture.debugElement.query(By.directive(OdontogramStub)).componentInstance as OdontogramStub;
  return { fixture, root, events, odontogram };
}

describe('RegisterTreatmentComponent', () => {
  it('le pasa al odontograma el diagnóstico vigente, el catálogo y lo ya registrado', () => {
    const { odontogram, root } = setup();

    expect(odontogram.currentExam()).toEqual({ id: 'exam-1' });
    expect(odontogram.catalog()).toEqual([{ id: 'cat-1' }]);
    expect(odontogram.procedures()).toEqual([proc()]);
    expect(root.textContent).toContain('Resina');
    expect(root.textContent).toContain('Diente #16');
  });

  it('si no hay diagnóstico ni procedimientos previos, arranca vacío', () => {
    const { odontogram } = setup(true);

    expect(odontogram.currentExam()).toBeNull();
    expect(odontogram.procedures()).toEqual([]);
  });

  it('al registrar un procedimiento lo agrega a la lista y muestra el aviso', () => {
    const { fixture, root, odontogram } = setup();

    odontogram.procedureRegistered.emit({
      procedures: [proc({ id: 'p2', toothNumber: null, treatmentId: 'carilla' })],
      message: 'Tratamiento registrado.',
    });
    fixture.detectChanges();

    expect(root.textContent).toContain('Tratamiento registrado.');
    expect(root.textContent).toContain('Sin diente asociado');
    expect(root.textContent).toContain('Carilla');
    expect(root.textContent).toContain('$');
  });

  it('un tratamiento que ya no existe muestra su id', () => {
    const { fixture, root, odontogram } = setup();

    odontogram.procedureRegistered.emit({ procedures: [proc({ id: 'p3', treatmentId: 'borrado' })], message: 'ok' });
    fixture.detectChanges();

    expect(root.textContent).toContain('borrado');
  });

  it('"Terminar" cierra el flujo como hecho; volver o cancelar, como cancelado', () => {
    const { root, events } = setup();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.reg-treatment__btn')];

    buttons.find((b) => b.classList.contains('reg-treatment__btn--primary'))!.click();
    buttons.find((b) => b.classList.contains('reg-treatment__btn--secondary'))!.click();
    root.querySelector<HTMLButtonElement>('app-page-header button')!.click();

    expect(events).toEqual({ done: 1, cancelled: 2 });
  });
});
