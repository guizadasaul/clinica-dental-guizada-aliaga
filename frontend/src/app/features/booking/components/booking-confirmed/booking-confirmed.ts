import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-booking-confirmed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './booking-confirmed.html',
  styleUrl: './booking-confirmed.scss',
})
export class BookingConfirmedComponent {}
