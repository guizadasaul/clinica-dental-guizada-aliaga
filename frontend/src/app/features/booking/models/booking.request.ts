export interface HoldSlotRequest {
  slot: string;
  doctorId: string;
}

export interface GuestContactRequest {
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal?: string;
  phone: string;
  email?: string;
}
