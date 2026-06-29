import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { Client } from '../../client/entities/client.entity';

/**
 * Nota (calificación de texto) que un admin escribe sobre un cliente.
 *
 * Es una reputación cruzada entre compañías: todos los admin pueden VER todas
 * las notas de un cliente, pero cada admin sólo puede modificar/eliminar la
 * que él mismo creó. Un admin tiene como máximo una nota por cliente
 * (UNIQUE client_id + created_by_user_id).
 *
 * Estas notas son internas (admin↔admin); el cliente NO las ve.
 */
@Entity('client_note')
@Unique('UQ_client_note_client_author', ['clientId', 'createdByUserId'])
@Index('IDX_client_note_client', ['clientId'])
export class ClientNote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'client_id', type: 'int' })
  clientId: number;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client?: Client;

  /** Usuario admin autor de la nota (req.user.sub). Clave de propiedad. */
  @Column({ name: 'created_by_user_id', type: 'int' })
  createdByUserId: number;

  /** Compañía activa del admin al momento de crear la nota (para mostrar de qué negocio viene). */
  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId?: number | null;

  @Column({ type: 'text' })
  note: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;

  /** Hidratado en runtime: nombre de la compañía autora (para el front). */
  companyName?: string | null;

  /** Hidratado en runtime: true si la nota pertenece al admin que consulta. */
  mine?: boolean;
}
