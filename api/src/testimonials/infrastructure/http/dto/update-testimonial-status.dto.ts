import { IsIn } from 'class-validator';

const REVIEW_STATUSES = ['approved', 'rejected'] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export class UpdateTestimonialStatusDto {
  @IsIn(REVIEW_STATUSES)
  status!: ReviewStatus;
}
