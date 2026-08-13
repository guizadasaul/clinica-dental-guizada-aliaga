export interface AvailabilityResponse {
  date: string;
  slots: string[];
}

export interface HoldResponse {
  appointmentId: string;
  slot: string;
  holdExpiresAt: string;
}

export interface AppointmentContactResult {
  id: string;
  status: string;
  holdExpiresAt: string | null;
}
