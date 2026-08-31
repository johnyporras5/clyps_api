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
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PAYMENT_METHODS } from '../entities/session-payment.entity';

export class SessionPaymentLineDto {
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

export class SessionPaymentTipDto {
  @Type(() => Number)
  @IsNumber()
  companyWorkerId: number;

  @IsOptional()
  @IsString()
  workerName?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;
}

// CLYP-321/318: producto vendido en el cobro.
export class PaymentProductDto {
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

// CLYP-318: atribución del payload (NO se persiste). Cada una genera un concepto.
export class PaymentAttributionDto {
  @IsIn(['commission', 'tip'])
  kind: 'commission' | 'tip';

  // A quién se le abona (company_worker).
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

  @IsIn(['service', 'product'])
  sourceType: 'service' | 'product';

  // Servicio → session_detail.id. Producto → índice (0-based) en products[]
  // (el session_product aún no existe al armar el payload; el backend lo
  // resuelve al id real de la fila creada).
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sourceId: number;

  // La comisión fija del ejecutor no se puede quitar (marca informativa).
  @IsOptional()
  @IsBoolean()
  isFixed?: boolean;

  // Moneda de la atribución (p. ej. propina en Bs sobre un servicio en $). Si no
  // viene, se usa la moneda del ítem. Aplica sobre todo a montos fijos.
  @IsOptional()
  @IsIn(['VES', 'USD', 'EUR'])
  currency?: string;

  // Rol de la comisión (cuando viene de una regla "por rol"). Solo para mostrar
  // en nómina; se guarda como etiqueta en el concepto.
  @IsOptional()
  @IsString()
  roleLabel?: string;
}

export class RegisterSessionPaymentDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SessionPaymentLineDto)
  lines: SessionPaymentLineDto[];

  // CLYP-321: productos vendidos en el cobro (0..N).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentProductDto)
  products?: PaymentProductDto[];

  // CLYP-318: atribuciones de comisión/propina. Si vienen, mandan ellas y NO se
  // auto-genera desde el split del servicio (compatibilidad: sin atribuciones =
  // comportamiento actual).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAttributionDto)
  attributions?: PaymentAttributionDto[];

  @IsOptional()
  @IsString()
  @Length(2, 10)
  tipCurrency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  tipExchangeRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tipBs?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionPaymentTipDto)
  tips?: SessionPaymentTipDto[];

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

  // "En deuda": se le paga al trabajador (comisiones/propinas normales) pero el
  // cliente aún no pagó a la company. Marca el cobro con collected_at = null.
  @IsOptional()
  @IsBoolean()
  pendingCollection?: boolean;

  // Ajuste a favor/en contra de la company en Bs
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  companyAdjustmentBs?: number | null;

  // Fecha del cobro (para citas pasadas: define en qué período cae la comisión y
  // el ingreso). Si se omite, es "ahora". Formato YYYY-MM-DD o ISO.
  @IsOptional()
  @IsString()
  collectedAt?: string;

  // Si la fecha cae en un período que NO está abierto, el backend responde 409
  // PERIOD_CLOSED. El front muestra un aviso y reenvía con esto en true para
  // confirmar que sí quiere sumar la comisión a ese período (se recongela).
  @IsOptional()
  @IsBoolean()
  confirmClosedPeriod?: boolean;

  // CLYP-362: descuentos por servicio (0..N, uno por servicio con descuento).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemDiscountDto)
  discounts?: ItemDiscountDto[];
}

/**
 * CLYP-362: descuento aplicado a UN servicio de la cita. `absorbedBy` decide
 * quién lo paga (salón / trabajador / ambos) y cambia el cálculo de comisión.
 */
export class ItemDiscountDto {
  // session_detail al que aplica el descuento.
  @Type(() => Number)
  @IsNumber()
  sessionDetailId: number;

  @IsIn(['percentage', 'fixed'])
  mode: 'percentage' | 'fixed';

  // percentage → basis points (20% = 2000). fixed → monto en unidades mínimas.
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  value: number;

  // Quién absorbe el descuento (obligatorio cuando hay descuento).
  @IsIn(['salon', 'worker', 'both'])
  absorbedBy: 'salon' | 'worker' | 'both';

  // Requerido implícitamente solo si absorbedBy='worker'; por defecto el
  // ejecutor del servicio.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  workerId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  reason?: string;
}

/** Revertir un cobro (motivo obligatorio para auditoría). */
export class RevertPaymentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason: string;
}
