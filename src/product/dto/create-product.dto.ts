import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsBoolean,
  IsIn,
} from 'class-validator';

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(145)
  name: string;

  // Categoría obligatoria: de ahí hereda el % por defecto.
  @IsInt()
  @Min(1)
  categoryId: number;

  @IsOptional()
  @IsIn(['VES', 'USD', 'EUR'])
  currency?: string;

  // Precio de venta en unidades mínimas (céntimos) de la moneda.
  @IsInt()
  @Min(0)
  salePriceMinor: number;

  // Stock inicial (opcional, 0 por defecto).
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsBoolean()
  appliesCommission?: boolean;

  // % en basis points (0–10000 = 0%–100%). Si se omite y aplica comisión,
  // hereda el default de la categoría.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  commissionBps?: number;

  // Activo por defecto si no viene.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
