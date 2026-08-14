import { IsOptional, IsString } from 'class-validator';

export class CreateQuoteDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
