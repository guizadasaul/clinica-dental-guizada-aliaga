import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class HoldSlotDto {
  @IsISO8601({ strict: true })
  slot!: string;

  // Opcional (CLI-47): la reserva pública hoy no pide tratamiento, pero
  // cuando lo haga, esto congela la duración real en la cita en vez de
  // asumir siempre un slot de 30 min.
  @IsOptional()
  @IsUUID()
  treatmentId?: string;
}
