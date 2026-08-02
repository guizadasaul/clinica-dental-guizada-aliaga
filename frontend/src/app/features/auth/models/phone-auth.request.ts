export interface RegisterPhoneRequest {
  fullName: string;
  phone: string;
  password: string;
}

export interface LoginPhoneRequest {
  phone: string;
  password: string;
}
