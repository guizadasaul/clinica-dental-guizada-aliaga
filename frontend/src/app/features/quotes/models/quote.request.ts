export interface CreateQuoteRequest {
  notes?: string;
}

export interface AddQuoteItemRequest {
  treatmentId: string;
  toothNumbers?: number[];
  customPrice?: number;
  quantity?: number;
}
