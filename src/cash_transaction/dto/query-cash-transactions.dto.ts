import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CASH_TRANSACTION_KINDS,
  type CashTransactionKind,
} from '../cash-transaction.enums';

/**
 * Filtros del listado de movimientos (CLYP-354). Todos opcionales y
 * combinables; sin ninguno devuelve la caja completa paginada.
 */
export class QueryCashTransactionsDto extends PaginationDto {
  /** Desde esta fecha contable, inclusive (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Hasta esta fecha contable, inclusive (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn([...CASH_TRANSACTION_KINDS])
  kind?: CashTransactionKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  /**
   * Nombre del proveedor. Se compara normalizado, así que da igual cómo se
   * escriba: "ferreteria lopez" encuentra los de "Ferretería López".
   */
  @IsOptional()
  @IsString()
  supplier?: string;
}
