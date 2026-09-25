import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { DashboardPageComponent } from './dashboard-page';
import { AuthService } from '../../../../auth/application/auth.service';
import { LogoComponent } from '../../../../shared/ui/logo/logo';

@Component({ selector: 'app-patient-dashboard', standalone: true, template: 'panel paciente' })
class PatientDashboardStub {
  readonly activeNav = input('home');
  readonly navChange = output<string>();
}
@Component({ selector: 'app-doctor-dashboard', standalone: true, template: 'panel doctor' })
class DoctorDashboardStub {
  readonly activeNav = input('home');
  readonly navChange = output<string>();
}
@Component({ selector: 'app-admin-dashboard', standalone: true, template: 'panel admin' })
class AdminDashboardStub {
  readonly activeNav = input('home');
  readonly navChange = output<string>();
}

@Component({ selector: 'app-chat-widget', standalone: true, template: 'asistente' })
class ChatWidgetStub {}

type Role = 'patient' | 'odontologist' | 'admin';

function setup(user: { role: Role; displayName?: string | null; photoURL?: string | null } | null) {
  const auth = { currentUser: signal(user), logout: vi.fn().mockResolvedValue(undefined) };
  const router = { navigate: vi.fn().mockResolvedValue(true) };
  TestBed.configureTestingModule({
    imports: [DashboardPageComponent],
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
    ],
  });
  TestBed.overrideComponent(DashboardPageComponent, {
    set: {
      imports: [
        PatientDashboardStub,
        DoctorDashboardStub,
        AdminDashboardStub,
        LogoComponent,
        ChatWidgetStub,
      ],
    },
  });
  const fixture = TestBed.createComponent(DashboardPageComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const navLabels = () =>
    Array.from(root.querySelectorAll('.sidebar__link')).map((b) => b.textContent?.trim());
  return { fixture, root, auth, router, navLabels };
}

describe('DashboardPageComponent', () => {
  it('mientras no se sabe el rol, muestra "cargando" anunciado a lectores de pantalla', () => {
    const { root } = setup(null);

    const loading = root.querySelector('.layout__loading');
    expect(loading?.getAttribute('aria-live')).toBe('polite');
    expect(root.textContent).toContain('Usuario');
  });

  it.each([
    ['patient', 'panel paciente', 'Paciente', 'Mis Citas'],
    ['odontologist', 'panel doctor', 'Odontólogo', 'Agenda'],
    ['admin', 'panel admin', 'Administrador', 'Doctores'],
  ] as const)(
    'con rol %s muestra su panel, su etiqueta y su menú',
    (role, panel, label, navItem) => {
      const { root, navLabels } = setup({ role, displayName: 'Ana Pérez' });

      expect(root.textContent).toContain(panel);
      expect(root.textContent).toContain(label);
      expect(root.textContent).toContain('Ana');
      expect(navLabels().join(' ')).toContain(navItem);
    },
  );

  it('monta el asistente virtual en el panel', () => {
    const { root } = setup({ role: 'patient' });

    expect(root.querySelector('app-chat-widget')).not.toBeNull();
  });

  it('elegir una sección del menú la marca activa, se la pasa al panel y cierra el menú mobile', () => {
    const { fixture, root } = setup({ role: 'odontologist' });
    root.querySelector<HTMLButtonElement>('.topbar__menu-btn')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.layout__overlay')).not.toBeNull();

    const agenda = Array.from(root.querySelectorAll<HTMLButtonElement>('.sidebar__link')).find(
      (b) => b.textContent?.includes('Agenda'),
    )!;
    agenda.click();
    fixture.detectChanges();

    expect(agenda.classList).toContain('sidebar__link--active');
    expect(
      fixture.debugElement.query(By.directive(DoctorDashboardStub)).componentInstance.activeNav(),
    ).toBe('schedule');
    expect(root.querySelector('.layout__overlay')).toBeNull();
  });

  it('el panel puede pedir cambiar de sección', () => {
    const { fixture } = setup({ role: 'admin' });
    const panel = fixture.debugElement.query(By.directive(AdminDashboardStub))
      .componentInstance as AdminDashboardStub;

    panel.navChange.emit('reports');
    fixture.detectChanges();

    expect(panel.activeNav()).toBe('reports');
  });

  it('el fondo oscuro del menú mobile lo cierra con click o con Escape', () => {
    const { fixture, root } = setup({ role: 'patient' });
    const open = () => {
      root.querySelector<HTMLButtonElement>('.topbar__menu-btn')!.click();
      fixture.detectChanges();
    };

    open();
    root.querySelector<HTMLElement>('.layout__overlay')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.layout__overlay')).toBeNull();

    open();
    root
      .querySelector('.layout__overlay')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('.layout__overlay')).toBeNull();

    open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(root.querySelector('.layout__overlay')).toBeNull();
  });

  it('muestra la foto del usuario si tiene', () => {
    const { root } = setup({ role: 'patient', photoURL: 'https://foto/ana.png' });

    expect(root.querySelector('.sidebar__avatar')?.getAttribute('src')).toBe(
      'https://foto/ana.png',
    );
  });

  it('cerrar sesión desloguea y lleva al login', async () => {
    const { root, auth, router } = setup({ role: 'patient' });

    root.querySelector<HTMLButtonElement>('.sidebar__logout')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
  });
});
