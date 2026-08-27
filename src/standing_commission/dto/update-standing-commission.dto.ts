import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

/** Edita el monto o el estado de una comisión fija (no cambia alcance/servicio). */
export class UpdateStandingCommissionDto {
  @IsOptional()
  @IsIn(['percentage', 'fixed'])
  basisMode?: 'percentage' | 'fixed';

  @IsOptional()
  @IsInt()
  @Min(1)
  value?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
