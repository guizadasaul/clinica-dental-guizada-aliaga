import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { SUPABASE_CLIENT } from '../supabase/supabase.client';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.backendUrl)) {
    return next(req);
  }

  const supabase = inject(SUPABASE_CLIENT);

  return from(supabase.auth.getSession()).pipe(
    switchMap(({ data }) => {
      const token = data.session?.access_token;
      return next(
        token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req,
      );
    }),
  );
};
