import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
} from '@angular/core';
import { AuthService } from '../../../../auth/application/auth.service';
import { LogoComponent } from '../../../../shared/ui/logo/logo';
import { AdminDoctorsComponent } from '../../../admin/components/admin-doctors/admin-doctors';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LogoComponent, AdminDoctorsComponent],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboardComponent {
  private readonly authService = inject(AuthService);

  readonly activeNav = input<string>('home');
  readonly navChange = output<string>();

  protected readonly user = this.authService.currentUser;

  protected readonly firstName = computed(() => {
    const name = this.user()?.displayName;
    return name ? name.split(' ')[0] : 'Administrador';
  });

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) { return 'Buenos días'; }
    if (hour < 19) { return 'Buenas tardes'; }
    return 'Buenas noches';
  });

  protected readonly today = computed(() =>
    new Date().toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  );

  protected onGoTo(key: string): void {
    this.navChange.emit(key);
  }
}
