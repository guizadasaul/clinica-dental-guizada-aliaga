import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SyncUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  inviteToken?: string;
}
