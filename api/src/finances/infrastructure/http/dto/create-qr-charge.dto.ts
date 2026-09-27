import { IsNumber, IsPositive } from 'class-validator';

export class CreateQrChargeDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;
}
