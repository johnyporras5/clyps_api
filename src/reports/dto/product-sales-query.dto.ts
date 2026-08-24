import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductSalesQueryDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate debe tener formato YYYY-MM-DD',
  })
  startDate: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate debe tener formato YYYY-MM-DD',
  })
  endDate: string;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  // Tipo de venta: cita (appointment), venta directa (direct) o compra de
  // trabajador (worker_purchase). Omitido = todas.
  @IsOptional()
  @IsIn(['appointment', 'direct', 'worker_purchase'])
  type?: 'appointment' | 'direct' | 'worker_purchase';

  @IsOptional()
  @Type(() => Number)
  productId?: number;

  // Trabajador: coincide con el vendedor (ventas a cliente) o el comprador
  // (compras de trabajador).
  @IsOptional()
  @Type(() => Number)
  employeeId?: number;
}
