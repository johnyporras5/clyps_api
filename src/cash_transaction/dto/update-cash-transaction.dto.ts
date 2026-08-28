import { PartialType } from '@nestjs/mapped-types';
import { CreateCashTransactionDto } from './create-cash-transaction.dto';

/**
 * Edición de un movimiento (PATCH): todos los campos opcionales, se manda solo
 * lo que cambia. `companyId` y `createdBy` no se tocan nunca.
 */
export class UpdateCashTransactionDto extends PartialType(
  CreateCashTransactionDto,
) {}
