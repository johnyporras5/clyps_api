import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency } from '../../common/enum/currency.enum';

/**
 * ONB-3: un servicio marcado por el dueño en la pantalla de confirmación.
 *
 * El precio y la comisión se aceptan en DOS formatos:
 *  - `cost` / `percentage`  → como los usa el resto del API (12 = $12, 40 = 40%)
 *  - `priceMinor` / `commissionBps` → como los define el contrato del ticket
 *    (1200 centavos = $12, 4000 basis points = 40%)
 *
 * Si llegan los dos, mandan `cost` / `percentage`. Omitirlos (o mandarlos null)
 * significa PENDIENTE, no "borrar": en un reenvío no se pisa un precio ya puesto.
 */
export class ConfirmServiceDto {
  /** Key de la plantilla (ONB-2). Se omite si el dueño agregó uno propio. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateKey?: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre del servicio no puede estar vacío' })
  @MaxLength(145)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  // --- Precio: formato del API ---
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost?: number | null;

  // --- Precio: formato del ticket (centavos) ---
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'priceMinor debe ser un entero (centavos)' })
  @Min(0)
  priceMinor?: number | null;

  // --- Comisión: formato del API (0-100) ---
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number | null;

  // --- Comisión: formato del ticket (basis points, 10000 = 100%) ---
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'commissionBps debe ser un entero (basis points)' })
  @Min(0)
  @Max(10000, { message: 'commissionBps no puede superar 10000 (100%)' })
  commissionBps?: number | null;

  /** Duración en minutos. No viene en las plantillas; el dueño la completa. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  standardTime?: number | null;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  /**
   * company_worker.id de quienes EJECUTAN el servicio (equipo del paso add_team).
   * Puede ir vacío: el servicio se crea igual, pero no se podrá agendar hasta
   * que tenga al menos uno.
   */
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  workerIds?: number[];
}

/** Una categoría marcada por el dueño, con los servicios que dejó marcados. */
export class ConfirmCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateKey?: string;

  @IsString()
  @IsNotEmpty({ message: 'El nombre de la categoría no puede estar vacío' })
  @MaxLength(145)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  /** Si viene vacío, la categoría se ignora (no se crean categorías vacías). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmServiceDto)
  services: ConfirmServiceDto[];
}

/** Body de POST /onboarding/services/confirm. */
export class ConfirmServicesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmCategoryDto)
  categories: ConfirmCategoryDto[];
}
