import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdjustStockDto {
  // Cambio a aplicar: + entrada de mercancía, − corrección. No puede ser 0
  // (validado en el servicio).
  @IsInt()
  delta: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
