import { IsString, IsUUID, Matches } from 'class-validator';

export class AvailabilityQueryDto {
  @IsUUID()
  doctorId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date debe tener el formato YYYY-MM-DD',
  })
  date!: string;
}
