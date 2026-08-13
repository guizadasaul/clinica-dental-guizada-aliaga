import { IsISO8601 } from 'class-validator';

export class HoldSlotDto {
  @IsISO8601({ strict: true })
  slot!: string;
}
