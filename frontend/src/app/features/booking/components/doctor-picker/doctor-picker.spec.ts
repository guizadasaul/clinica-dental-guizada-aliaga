import { TestBed } from '@angular/core/testing';
import { DoctorPickerComponent } from './doctor-picker';
import type { Doctor } from '../../models/booking.model';

function fakeDoctor(overrides: Partial<Doctor> = {}): Doctor {
  return {
    id: 'doctor-1',
    displayName: 'Dra. Ejemplo',
    specialty: 'Ortodoncia',
    bio: null,
    photoUrl: null,
    displayOrder: 0,
    isBookable: true,
    ...overrides,
  };
}

function setup() {
  TestBed.configureTestingModule({ imports: [DoctorPickerComponent] });
  return TestBed.createComponent(DoctorPickerComponent);
}

function el<T extends Element>(fixture: ReturnType<typeof setup>, selector: string): T {
  return (fixture.nativeElement as HTMLElement).querySelector(selector) as T;
}

function els(fixture: ReturnType<typeof setup>, selector: string): NodeListOf<Element> {
  return (fixture.nativeElement as HTMLElement).querySelectorAll(selector);
}

describe('DoctorPickerComponent', () => {
  it('shows a loading hint and renders nothing else while loading', () => {
    const fixture = setup();
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(el(fixture, '.doctor-picker__hint')?.textContent).toContain('Cargando');
    expect(els(fixture, '.doctor-picker__card').length).toBe(0);
  });

  it('shows the given error instead of the doctor grid', () => {
    const fixture = setup();
    fixture.componentRef.setInput('error', 'No pudimos cargar los doctores');
    fixture.detectChanges();

    expect(el(fixture, '.doctor-picker__error')?.textContent).toContain(
      'No pudimos cargar los doctores',
    );
    expect(els(fixture, '.doctor-picker__card').length).toBe(0);
  });

  it('renders one card per doctor with name and specialty', () => {
    const fixture = setup();
    fixture.componentRef.setInput('doctors', [
      fakeDoctor({ id: 'doctor-1', displayName: 'Dr. Ariel', specialty: 'Endodoncia' }),
      fakeDoctor({ id: 'doctor-2', displayName: 'Dra. Marylu', specialty: null }),
    ]);
    fixture.detectChanges();

    const cards = els(fixture, '.doctor-picker__card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Dr. Ariel');
    expect(cards[0].textContent).toContain('Endodoncia');
    expect(cards[1].textContent).toContain('Dra. Marylu');
  });

  it('emits doctorSelected with the clicked doctor id', () => {
    const fixture = setup();
    fixture.componentRef.setInput('doctors', [fakeDoctor({ id: 'doctor-1' })]);
    fixture.detectChanges();
    const emitted: string[] = [];
    fixture.componentInstance.doctorSelected.subscribe((id) => emitted.push(id));

    el<HTMLButtonElement>(fixture, '.doctor-picker__card').click();

    expect(emitted).toEqual(['doctor-1']);
  });
});
