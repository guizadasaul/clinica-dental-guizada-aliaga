export interface AvailabilityResponse {
  date: string;
  slots: string[];
}

export interface AvailabilityRangeResponse {
  from: string;
  days: number;
  slotsByDate: Record<string, string[]>;
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

export interface CheckoutResponse {
  qrId: string;
  qrImageBase64: string;
  amount: number;
  holdExpiresAt: string;
}

export interface AppointmentPublicStatus {
  status: string;
  paid: boolean;
  holdExpiresAt: string | null;
}
