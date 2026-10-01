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
  amount: number;
  /** A mano solo efectivo: el QR BANECO se registra al verificarlo contra el banco (CLI-159). */
  paymentMethod?: 'cash';
  notes?: string;
}
