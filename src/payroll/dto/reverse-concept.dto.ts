import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReverseConceptDto {
  // Motivo de la corrección (queda en metadata, visible y auditable).
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
