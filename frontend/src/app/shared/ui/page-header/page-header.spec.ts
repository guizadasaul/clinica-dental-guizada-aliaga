import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageHeaderComponent } from './page-header';

@Component({
  standalone: true,
  imports: [PageHeaderComponent],
  template: `
    <app-page-header title="Pacientes" subtitle="2 pacientes">
      <button actions type="button" class="host-action">Nuevo</button>
    </app-page-header>
  `,
})
class HostComponent {}

describe('PageHeaderComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [PageHeaderComponent] });
    return TestBed.createComponent(PageHeaderComponent);
  }

  it('muestra el título en un h1 y el subtítulo solo si viene', () => {
    const fixture = setup();
    fixture.componentRef.setInput('title', 'Agenda');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Agenda');
    expect(root.querySelector('.page-header__subtitle')).toBeFalsy();

    fixture.componentRef.setInput('subtitle', 'Semana actual');
    fixture.detectChanges();
    expect(root.querySelector('.page-header__subtitle')?.textContent).toContain('Semana actual');
  });

  it('el botón volver aparece solo con backLabel y emite back', () => {
    const fixture = setup();
    fixture.componentRef.setInput('title', 'Historia clínica');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.page-header__back')).toBeFalsy();

    fixture.componentRef.setInput('backLabel', 'Volver');
    fixture.detectChanges();
    let emitted = 0;
    fixture.componentInstance.back.subscribe(() => emitted++);
    (root.querySelector('.page-header__back') as HTMLButtonElement).click();

    expect(root.querySelector('.page-header__back')?.textContent).toContain('Volver');
    expect(emitted).toBe(1);
  });

  it('proyecta las acciones marcadas con el atributo actions', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.page-header__actions .host-action')).toBeTruthy();
  });
});
