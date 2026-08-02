import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHygieneHabitsDto {
  @IsOptional()
  @IsBoolean()
  usesToothbrush?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brushingFrequency?: string;

  @IsOptional()
  @IsBoolean()
  usesDentalFloss?: boolean;

  @IsOptional()
  @IsBoolean()
  usesToothpick?: boolean;

  @IsOptional()
  @IsBoolean()
  brushesTongue?: boolean;

  @IsOptional()
  @IsBoolean()
  usesMouthwash?: boolean;
}
