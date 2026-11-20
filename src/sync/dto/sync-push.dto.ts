import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';
import { UUID_RE } from '../../idempotency/idempotency.interceptor';

/** BE-OFF-5: máximo de operaciones por lote. */
export const SYNC_MAX_OPERATIONS = 50;

export const SYNC_OPERATION_TYPES = [
  'create_client',
  'create_session',
] as const;
export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

export class SyncOperationDto {
  /** La misma Idempotency-Key que llevaría el endpoint suelto (UUID). */
  @Matches(UUID_RE, { message: 'idempotencyKey debe ser un UUID' })
  idempotencyKey: string;

  @IsIn(SYNC_OPERATION_TYPES)
  type: SyncOperationType;

  /**
   * El body del endpoint suelto (register-client-by-admin o
   * create-with-detail). Se valida con su propio DTO al procesar la
   * operación, para que un payload malo falle SOLO esa operación.
   */
  @IsObject()
  payload: Record<string, unknown>;

  /**
   * Solo en `create_session`: la clave de la operación `create_client` (de
   * este lote o de uno anterior) cuyo cliente usa la cita.
   */
  @IsOptional()
  @Matches(UUID_RE, { message: 'clientRef debe ser un UUID' })
  clientRef?: string;
}

export class SyncPushDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SYNC_MAX_OPERATIONS)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations: SyncOperationDto[];
}
