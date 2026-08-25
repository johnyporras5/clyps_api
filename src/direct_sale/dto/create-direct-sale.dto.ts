import {
  IsArray,
  ArrayNotEmpty,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PAYMENT_METHODS } from '../../session/entities/session-payment.entity';

// Reutiliza la misma forma que el cobro de una cita, pero sin servicios ni cita.
export class DirectSaleLineDto {
  @IsString()
  @Length(2, 10)
  currency: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  exchangeRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotalBs?: number | null;
}

export class DirectSaleProductDto {
  @Type(() => Number)
  @IsNumber()
  productId: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity: number;

  // Precio unitario editable (minor). Si se omite, el del catálogo.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPriceMinor?: number;

  // company_worker que lo vendió; null/omitido = "nadie".
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sellerEmployeeId?: number | null;
}

// Comisión/propina. En la venta directa siempre se atribuye a un producto.
export class DirectSaleAttributionDto {
  @IsIn(['commission', 'tip'])
  kind: 'commission' | 'tip';

  @Type(() => Number)
  @IsNumber()
  employeeId: number;

  @IsIn(['percentage', 'fixed'])
  basisMode: 'percentage' | 'fixed';

  // percentage → basis points; fixed → monto en unidades mínimas.
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value: number;

  // Índice (0-based) en products[]; el backend lo resuelve al session_product.id.
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sourceId: number;

  // Moneda de la atribución (p. ej. propina en Bs). Si no viene, la del producto.
  @IsOptional()
  @IsIn(['VES', 'USD', 'EUR'])
  currency?: string;
}

export class CreateDirectSaleDto {
  // Cliente al que se le vende. Opcional (walk-in anónimo).
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  clientId?: number | null;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DirectSaleProductDto)
  products: DirectSaleProductDto[];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DirectSaleLineDto)
  lines: DirectSaleLineDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DirectSaleAttributionDto)
  attributions?: DirectSaleAttributionDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalBs?: number | null;

  @IsOptional()
  @IsIn([...PAYMENT_METHODS])
  method?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reference?: string | null;

  // "En deuda": el cliente aún no pagó (collected_at = null), pero al trabajador
  // sí se le abonan comisiones/propinas.
  @IsOptional()
  @IsBoolean()
  pendingCollection?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  companyAdjustmentBs?: number | null;
}
