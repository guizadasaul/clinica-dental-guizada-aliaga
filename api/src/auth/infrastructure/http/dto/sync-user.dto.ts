import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SyncUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
