export interface TestimonialResponse {
  id: string;
  name: string;
  treatment: string;
  comment: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}
