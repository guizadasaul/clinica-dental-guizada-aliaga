import { IsIn } from 'class-validator';

export class CreateInviteDto {
  @IsIn(['email', 'whatsapp'])
  channel!: 'email' | 'whatsapp';
}
