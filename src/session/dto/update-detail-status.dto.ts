import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDetailStatusDto {
  @IsNumber()
  status: number;

  // Motivo de cancelación — opcional, solo se guarda cuando status = 5 (Cancelado)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
