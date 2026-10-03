import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { DoctorSettingsComponent } from './doctor-settings';
import { DoctorProfileService } from '../../services/doctor-profile.service';
import type { DoctorProfile } from '../../models/doctor-profile.model';

const PROFILE: DoctorProfile = {
  id: 'doctor-1',
  displayName: 'Dr. Saul Guizada',
  firstName: 'Saul',
  lastNamePaternal: 'Guizada',
  lastNameMaternal: null,
  email: 'saul@clinica.test',
  phone: '+59171234567',
  specialty: 'General',
  bio: null,
  color: '#2563eb',
  scheduleBlocks: [{ weekday: 1, start: '08:00', end: '12:00' }],
};

function setup(getMine: unknown = of(PROFILE), updateMine: unknown = of(PROFILE)) {
  const profile = {
    getMine: vi.fn().mockReturnValue(getMine),
    updateMine: vi.fn().mockReturnValue(updateMine),
  };
  TestBed.configureTestingModule({
    imports: [DoctorSettingsComponent],
    providers: [
      { provide: DoctorProfileService, useValue: profile },
      provideTranslateService({ defaultLanguage: 'es' }),
    ],
  });
  const fixture = TestBed.createComponent(DoctorSettingsComponent);
  const root = fixture.nativeElement as HTMLElement;
  const el = <T extends Element>(selector: string) => root.querySelector(selector) as T;
  const type = (selector: string, value: string) => {
    const input = el<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };
  const submit = async () => {
    el<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    await settle();
  };
  return { fixture, root, profile, el, type, settle, submit };
}

describe('DoctorSettingsComponent (CLI-191)', () => {
  it('carga el perfil del doctor y lo muestra, con el correo solo de lectura', async () => {
    const { root, el, settle } = setup();
    await settle();

    expect(el<HTMLInputElement>('#displayName').value).toBe('Dr. Saul Guizada');
    expect(el<HTMLInputElement>('#firstName').value).toBe('Saul');
    expect(el<HTMLInputElement>('#specialty').value).toBe('General');
    expect(root.textContent).toContain('saul@clinica.test');
    expect(root.querySelector('input[type="email"]')).toBeNull();
    expect(root.querySelectorAll('.schedule__row')).toHaveLength(1);
  });

  it('mientras carga y si falla la carga, con "Reintentar"', async () => {
    const loading = setup(new Observable<DoctorProfile>(() => undefined));
    loading.fixture.detectChanges();
    expect(loading.root.textContent).toContain('Cargando tu configuración');

    TestBed.resetTestingModule();
    const failing = setup(throwError(() => new Error('500')));
    await failing.settle();
    expect(failing.root.textContent).toContain('No se pudo cargar tu configuración');

    failing.profile.getMine.mockReturnValue(of(PROFILE));
    failing.root.querySelector<HTMLButtonElement>('.settings__btn--ghost')!.click();
    await failing.settle();
    expect(failing.el<HTMLInputElement>('#firstName').value).toBe('Saul');
  });

  it('al guardar manda los datos normalizados y el color y el horario, y avisa que se guardó', async () => {
    const { profile, root, el, type, settle, submit } = setup();
    await settle();

    type('#displayName', '  dra.   ana  pérez ');
    type('#specialty', ' ortodoncia ');
    type('#bio', '  Atiendo   adultos. ');
    el<HTMLButtonElement>('button.color-picker__swatch:nth-of-type(3)').click();
    await submit();

    expect(profile.updateMine).toHaveBeenCalledWith({
      displayName: 'Dra. Ana Pérez',
      firstName: 'Saul',
      lastNamePaternal: 'Guizada',
      phone: '+59171234567',
      specialty: 'Ortodoncia',
      bio: 'Atiendo adultos.',
      color: '#16a34a',
      scheduleBlocks: [{ weekday: 1, start: '08:00', end: '12:00' }],
    });
    expect(root.textContent).toContain('Cambios guardados');
  });

  it('al salir de un campo corto lo deja con mayúscula inicial y un solo espacio', async () => {
    const { el, type, settle, fixture } = setup();
    await settle();

    type('#firstName', '  maría   josé ');
    el<HTMLInputElement>('#firstName').dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(el<HTMLInputElement>('#firstName').value).toBe('María José');
  });

  // Doctores cargados antes de que existieran nombre y apellidos (CLI-76): no se
  // les exige llenarlos para poder cambiar el color o el horario.
  it('un perfil sin nombre ni apellidos se puede guardar sin mandarlos', async () => {
    const { profile, settle, submit } = setup(
      of({ ...PROFILE, firstName: null, lastNamePaternal: null }),
    );
    await settle();

    await submit();

    expect(profile.updateMine).toHaveBeenCalledTimes(1);
    const [sent] = profile.updateMine.mock.calls[0] as [Record<string, unknown>];
    expect(sent).not.toHaveProperty('firstName');
    expect(sent).not.toHaveProperty('lastNamePaternal');
  });

  it('el nombre público es obligatorio y un nombre con números bloquea el guardado, marcado en rojo', async () => {
    const { profile, root, el, type, settle, submit } = setup();
    await settle();

    type('#firstName', 'M4ria');
    type('#displayName', '');
    await submit();

    expect(profile.updateMine).not.toHaveBeenCalled();
    expect(el('#displayName-err')?.textContent).toContain('obligatorio');
    expect(el('#firstName-err')?.textContent).toContain('solo puede tener letras');
    expect(root.textContent).toContain('Revisa los campos marcados en rojo');
  });

  it('un horario con inicio después del fin bloquea el guardado', async () => {
    const { profile, root, el, settle, submit } = setup();
    await settle();

    const end = el<HTMLInputElement>('.schedule__row input[type="time"]:last-of-type');
    end.value = '07:00';
    end.dispatchEvent(new Event('change'));
    await submit();

    expect(profile.updateMine).not.toHaveBeenCalled();
    expect(root.querySelector('.schedule__error')?.textContent).toContain('inicio');
  });

  it('muestra el motivo de la API si rechaza el guardado, y uno genérico si no trae mensaje', async () => {
    const rejected = setup(of(PROFILE), throwError(() => ({ error: { message: ['phone inválido', 'color inválido'] } })));
    await rejected.settle();
    await rejected.submit();
    expect(rejected.el('.settings__error-banner')?.textContent).toContain('phone inválido color inválido');

    TestBed.resetTestingModule();
    const generic = setup(of(PROFILE), throwError(() => new Error('red')));
    await generic.settle();
    await generic.submit();
    expect(generic.el('.settings__error-banner')?.textContent).toContain('No se pudieron guardar');
  });
});
