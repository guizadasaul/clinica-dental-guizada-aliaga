import { IsString, MinLength, MaxLength } from 'class-validator';
import { WordCount } from '../../../../shared/validators/word-count.validator.js';

const COMMENT_MIN_WORDS = 20;
const COMMENT_MAX_WORDS = 120;

export class CreateTestimonialDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  treatment!: string;

  @IsString()
  @MaxLength(1200)
  @WordCount(COMMENT_MIN_WORDS, COMMENT_MAX_WORDS)
  comment!: string;
}
