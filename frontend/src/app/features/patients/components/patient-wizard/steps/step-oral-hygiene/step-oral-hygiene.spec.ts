import { TestBed } from '@angular/core/testing';
import { StepOralHygieneComponent, type OralHygieneSubmit } from './step-oral-hygiene';

function setup() {
  TestBed.configureTestingModule({ imports: [StepOralHygieneComponent] });
  const fixture = TestBed.createComponent(StepOralHygieneComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const submitted: OralHygieneSubmit[] = [];
  let back = 0;
  fixture.componentInstance.submitStep.subscribe((v) => submitted.push(v));
  fixture.componentInstance.back.subscribe(() => back++);
  const checkboxes = () => [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const check = (index: number, checked = true) => {
    const box = checkboxes()[index];
    box.checked = checked;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const submit = () => {
    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const setValue = (id: string, value: string, event = 'input') => {
    const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    el.value = value;
    el.dispatchEvent(new Event(event));
    fixture.detectChanges();
  };
  return { fixture, root, submitted, check, submit, setValue, back: () => back };
}

describe('StepOralHygieneComponent', () => {
  it('sin marcar nada manda todo en falso', () => {
    const { submitted, submit } = setup();

    submit();

    expect(submitted).toEqual([
      {
        hygieneHabits: {
          usesToothbrush: false,
          brushingFrequency: undefined,
          usesDentalFloss: false,
          usesToothpick: false,
          brushesTongue: false,
          usesMouthwash: false,
        },
        clinicalExam: { tartar: false, saburra: false, bacterialPlaque: false, halitosis: false, occlusion: undefined },
      },
    ]);
  });

  it('si usa cepillo, la frecuencia es obligatoria', () => {
    const { root, submitted, check, submit } = setup();

    check(0);
    submit();

    expect(submitted).toEqual([]);
    expect(root.textContent).toContain('La frecuencia de cepillado es obligatoria');
  });

  it('manda los hábitos y hallazgos marcados, con la frecuencia y la oclusión normalizada', () => {
    const { submitted, check, submit, setValue } = setup();

    check(0);
    setValue('brushingFrequency', 'twice_daily', 'change');
    [1, 2, 3, 4, 5, 6, 7, 8].forEach((i) => check(i));
    setValue('occlusion', '  Clase   I  ');
    submit();

    expect(submitted[0]).toEqual({
      hygieneHabits: {
        usesToothbrush: true,
        brushingFrequency: 'twice_daily',
        usesDentalFloss: true,
        usesToothpick: true,
        brushesTongue: true,
        usesMouthwash: true,
      },
      clinicalExam: { tartar: true, saburra: true, bacterialPlaque: true, halitosis: true, occlusion: 'Clase I' },
    });
  });

  it('destildar el cepillo borra la frecuencia elegida', () => {
    const { root, submitted, check, submit, setValue } = setup();
    check(0);
    setValue('brushingFrequency', 'twice_daily', 'change');

    check(0, false);
    submit();

    expect(root.querySelector('#brushingFrequency')).toBeNull();
    expect(submitted[0].hygieneHabits.brushingFrequency).toBeUndefined();
  });

  it('una oclusión inválida (muy corta) frena el envío', () => {
    const { submitted, submit, setValue } = setup();

    setValue('occlusion', 'ab');
    submit();

    expect(submitted).toEqual([]);
  });

  it('"Atrás" vuelve al paso anterior', () => {
    const { root, back } = setup();

    root.querySelector<HTMLButtonElement>('.step-form__btn--secondary')!.click();

    expect(back()).toBe(1);
  });
});
