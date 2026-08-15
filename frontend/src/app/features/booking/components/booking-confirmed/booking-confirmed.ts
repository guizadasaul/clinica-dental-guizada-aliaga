import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-booking-confirmed',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './booking-confirmed.html',
  styleUrl: './booking-confirmed.scss',
})
export class BookingConfirmedComponent {}
