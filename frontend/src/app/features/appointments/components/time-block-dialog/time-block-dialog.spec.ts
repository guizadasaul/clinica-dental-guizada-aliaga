import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TimeBlockDialogComponent } from './time-block-dialog';
import { AppointmentsService } from '../../services/appointments.service';
import type { TimeBlock } from '../../models/appointment.model';

const SAVED: TimeBlock = {
  id: 'b1',
  doctorId: 'd1',
  startsAt: '2026-10-06T13:00:00.000Z',
  endsAt: '2026-10-06T15:00:00.000Z',
  reason: 'Curso',
};

function setup(block: TimeBlock | null = null) {
  const service = {
    createTimeBlock: vi.fn().mockReturnValue(of(SAVED)),
    deleteTimeBlock: vi.fn().mockReturnValue(of(undefined)),
  };
  TestBed.configureTestingModule({
    imports: [TimeBlockDialogComponent],
    providers: [{ provide: AppointmentsService, useValue: service }],
  });
  const fixture = TestBed.createComponent(TimeBlockDialogComponent);
  fixture.componentRef.setInput('date', '2026-10-06');
  fixture.componentRef.setInput('block', block);
  return { fixture, service };
}

async function settle(fixture: ComponentFixture<TimeBlockDialogComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function setInput(fixture: ComponentFixture<TimeBlockDialogComponent>, id: string, value: string) {
  const input = fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event(id.endsWith('reason') ? 'input' : 'change'));
}

describe('TimeBlockDialogComponent (CLI-195)', () => {
  it('reserva el rango con el offset de Bolivia y avisa con saved', async () => {
    const { fixture, service } = setup();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    await settle(fixture);

    setInput(fixture, 'block-modal-from', '09:00');
    setInput(fixture, 'block-modal-to', '11:30');
    setInput(fixture, 'block-modal-reason', 'Curso');
    await settle(fixture);
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle(fixture);

    expect(service.createTimeBlock).toHaveBeenCalledWith({
      startsAt: '2026-10-06T09:00:00-04:00',
      endsAt: '2026-10-06T11:30:00-04:00',
      reason: 'Curso',
    });
    expect(saved).toHaveBeenCalledWith(SAVED);
  });

  it('no deja reservar si el fin no es posterior al inicio', async () => {
    const { fixture, service } = setup();
    await settle(fixture);

    setInput(fixture, 'block-modal-from', '12:00');
    setInput(fixture, 'block-modal-to', '10:00');
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('posterior a la de inicio');
    expect(
      (fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(service.createTimeBlock).not.toHaveBeenCalled();
  });

  it('"Todo el día" completa de 00:00 a 23:55', async () => {
    const { fixture } = setup();
    await settle(fixture);

    (fixture.nativeElement.querySelector('.block-modal__link') as HTMLButtonElement).click();
    await settle(fixture);

    expect((fixture.nativeElement.querySelector('#block-modal-from') as HTMLInputElement).value).toBe('00:00');
    expect((fixture.nativeElement.querySelector('#block-modal-to') as HTMLInputElement).value).toBe('23:55');
  });

  it('muestra el mensaje del backend cuando hay citas que chocan', async () => {
    const { fixture, service } = setup();
    service.createTimeBlock.mockReturnValue(
      throwError(() => ({ error: { message: 'No se puede reservar ese horario: ya tienes 1 cita' } })),
    );
    await settle(fixture);

    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('No se puede reservar ese horario');
  });

  it('con un horario existente lo muestra y lo quita tras confirmar', async () => {
    const { fixture, service } = setup(SAVED);
    const removed = vi.fn();
    fixture.componentInstance.removed.subscribe(removed);
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('Curso');
    (fixture.nativeElement.querySelector('.block-modal__btn--danger-ghost') as HTMLButtonElement).click();
    await settle(fixture);
    expect(service.deleteTimeBlock).not.toHaveBeenCalled();

    (fixture.nativeElement.querySelector('.block-modal__btn--danger') as HTMLButtonElement).click();
    await settle(fixture);

    expect(service.deleteTimeBlock).toHaveBeenCalledWith('b1');
    expect(removed).toHaveBeenCalledWith('b1');
  });
});
