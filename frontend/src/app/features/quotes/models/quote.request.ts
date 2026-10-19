export interface CreateQuoteRequest {
  notes?: string;
}

export interface AddQuoteItemRequest {
  treatmentId: string;
  toothNumbers?: number[];
  customPrice?: number;
  quantity?: number;
}

export interface AddPaymentRequest {
  /** CLI-261: los tratamientos que se pagan, cada uno por su saldo completo. */
  lineKeys: string[];
  /** A mano solo efectivo: el QR BANECO se registra al verificarlo contra el banco (CLI-159). */
  paymentMethod?: 'cash';
  notes?: string;
}
