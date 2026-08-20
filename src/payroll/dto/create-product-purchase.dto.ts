import { IsInt, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Compra de un producto por parte de un trabajador: se le deduce de la nómina,
 * descuenta stock y queda registrada como venta ('worker_purchase'). No genera
 * comisión.
 *
 * La deducción SIEMPRE se hace en Bs (no en efectivo de la moneda del producto):
 *  - Producto en Bs → se deduce el precio × cantidad.
 *  - Producto en $/€ → se deduce el equivalente en Bs (`amountBs`), editable
 *    por el admin al registrarla, junto con la tasa usada (`exchangeRate`).
 * La venta (session_product) se guarda en su moneda nativa, así el reporte de
 * ingresos no cambia.
 */
export class CreateProductPurchaseDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  // Monto en Bs a deducir de la nómina. Requerido para productos en moneda
  // extranjera (es el equivalente editable); para productos en Bs es opcional
  // (si no llega, se usa el precio × cantidad).
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amountBs?: number;

  // Tasa (Bs por 1 unidad de la moneda del producto) usada para el equivalente.
  // Solo aplica a productos en moneda extranjera; se guarda como referencia.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;
}
