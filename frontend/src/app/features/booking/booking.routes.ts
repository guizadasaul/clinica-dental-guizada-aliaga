import { Routes } from '@angular/router';

export const bookingRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/booking-page/booking-page').then((c) => c.BookingPageComponent),
  },
];
