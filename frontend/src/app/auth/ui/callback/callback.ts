import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../application/auth.service';

@Component({
  selector: 'app-callback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './callback.html',
  styleUrl: './callback.scss',
})
export class CallbackComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    if (params.get('error') || params.get('error_description')) {
      this.errorMessage.set('No se pudo iniciar sesión con Google. Intentá nuevamente.');
      return;
    }

    await this.auth.authReady;

    await this.router.navigateByUrl(this.auth.currentUser() ? '/dashboard' : '/auth/login', {
      replaceUrl: true,
    });
  }
}
