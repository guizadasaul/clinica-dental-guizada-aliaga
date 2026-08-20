export type TestimonialStatus = 'pending' | 'approved' | 'rejected';

export interface Testimonial {
  id: string;
  name: string;
  treatment: string;
  comment: string;
  status: TestimonialStatus;
  createdAt: Date;
  updatedAt: Date;
}
