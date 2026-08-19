import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Compra de un producto por parte de un trabajador: se le deduce de la nómina,
 * descuenta stock y queda registrada como venta ('worker_purchase'). El monto
 * es el precio de venta normal × cantidad; no genera comisión.
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
}
