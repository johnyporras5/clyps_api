import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Crea una comisión fija. Tres formas:
 *  - Global:    scope='all_services', basisMode + value (+ currency si 'fixed').
 *  - Específica: scope='service', serviceId, basisMode + value (+ currency).
 *  - Exclusión:  scope='service', serviceId, isExclusion=true (sin monto).
 */
export class CreateStandingCommissionDto {
  @IsInt()
  companyWorkerId: number;

  @IsIn(['all_services', 'service'])
  scope: 'all_services' | 'service';

  // Requerido cuando scope='service' (específica o exclusión).
  @ValidateIf((o) => o.scope === 'service')
  @IsInt()
  serviceId?: number;

  @IsOptional()
  @IsBoolean()
  isExclusion?: boolean;

  // Monto: requerido salvo en exclusiones.
  @ValidateIf((o) => !o.isExclusion)
  @IsIn(['percentage', 'fixed'])
  basisMode?: 'percentage' | 'fixed';

  // percentage → bps (10% = 1000); fixed → céntimos.
  @ValidateIf((o) => !o.isExclusion)
  @IsInt()
  @Min(1)
  value?: number;

  // Moneda del monto fijo (requerida solo con basisMode='fixed').
  @ValidateIf((o) => !o.isExclusion && o.basisMode === 'fixed')
  @IsString()
  @Length(3, 3)
  currency?: string;
}
