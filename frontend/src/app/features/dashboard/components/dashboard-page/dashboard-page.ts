import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../../auth/application/auth.service';
import { PatientDashboardComponent } from '../patient-dashboard/patient-dashboard';
import { DoctorDashboardComponent } from '../doctor-dashboard/doctor-dashboard';
import { LogoComponent } from '../../../../shared/ui/logo/logo';

interface NavItem {
  readonly icon: string;
  readonly label: string;
  readonly key: string;
}

const PATIENT_NAV: NavItem[] = [
  { icon: 'home', label: 'Inicio', key: 'home' },
  { icon: 'calendar_month', label: 'Mis Citas', key: 'appointments' },
  { icon: 'add_circle', label: 'Solicitar Cita', key: 'request' },
  { icon: 'history', label: 'Mi Historial', key: 'history' },
  { icon: 'person', label: 'Mi Perfil', key: 'profile' },
];

const DOCTOR_NAV: NavItem[] = [
  { icon: 'home', label: 'Inicio', key: 'home' },
  { icon: 'calendar_month', label: 'Agenda', key: 'schedule' },
  { icon: 'group', label: 'Pacientes', key: 'patients' },
  { icon: 'folder_open', label: 'Historial Clínico', key: 'records' },
  { icon: 'rate_review', label: 'Comentarios', key: 'testimonials' },
  { icon: 'settings', label: 'Configuración', key: 'settings' },
];

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PatientDashboardComponent, DoctorDashboardComponent, LogoComponent],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.authService.currentUser;
  protected readonly activeNav = signal('home');
  protected readonly sidebarOpen = signal(false);

  protected readonly role = computed(() => this.user()?.role ?? null);

  protected readonly navItems = computed<NavItem[]>(() =>
    this.role() === 'odontologist' ? DOCTOR_NAV : PATIENT_NAV,
  );

  protected readonly roleLabel = computed(() => {
    const r = this.role();
    if (r === 'odontologist') {
      return 'Odontólogo';
    }
    if (r === 'patient') {
      return 'Paciente';
    }
    return '';
  });

  protected readonly displayName = computed(() => {
    const name = this.user()?.displayName;
    if (!name) {
      return 'Usuario';
    }
    return name.split(' ')[0];
  });

  protected setActive(key: string): void {
    this.activeNav.set(key);
    this.sidebarOpen.set(false);
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  protected async logout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigate(['/auth/login']);
  }
}
