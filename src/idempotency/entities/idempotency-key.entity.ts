import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type IdempotencyStatus = 'processing' | 'done';

/** Recibo de una petición con `Idempotency-Key`. Ver la migración 088. */
@Entity('idempotency_key')
export class IdempotencyKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'idem_key', type: 'char', length: 36 })
  idemKey: string;

  /** `Controlador.metodo`: la misma clave no vale para otro endpoint. */
  @Column({ type: 'varchar', length: 100 })
  endpoint: string;

  /** sha256 del body (y de la foto, si viene). */
  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash: string;

  @Column({ type: 'varchar', length: 12 })
  status: IdempotencyStatus;

  /**
   * Código HTTP con que se repite la respuesta. NULL = éxito (el código normal
   * del endpoint). Un número = rechazo definitivo guardado, p. ej. 409
   * SLOT_TAKEN (migración 089).
   */
  @Column({ name: 'response_status', type: 'smallint', nullable: true })
  responseStatus: number | null;

  /** JSON de la respuesta, tal cual la devolvió el handler. */
  @Column({ name: 'response_body', type: 'mediumtext', nullable: true })
  responseBody: string | null;

  @Column({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt: Date | null;
}
