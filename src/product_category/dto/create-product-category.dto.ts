import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreateProductCategoryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(145)
  name: string;

  // Comisión por defecto en basis points (0–10000 = 0%–100%). Opcional.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  defaultCommissionBps?: number;
}
