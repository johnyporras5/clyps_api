import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

/**
 * Tipos de notificación (CLYP-257 / §1). El cliente usa `type` para decidir a
 * qué pantalla navegar (ver §5 / payload `data`).
 */
export type NotificationType =
  | 'appointment'
  | 'offer'
  | 'review'
  | 'assignment'
  | 'reminder'
  | 'system';

/**
 * Payload de navegación que consume la app al tocar la notificación (§5).
 * `entityId` = id de la entidad destino (cita / oferta / etc.).
 */
export interface NotificationData {
  type: NotificationType;
  entityId?: number;
  companyId?: number;
  [key: string]: unknown;
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  /** Destinatario de la notificación. */
  @Index('IDX_notifications_user')
  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 30 })
  type: NotificationType;

  /** Título visible. */
  @Column({ length: 255 })
  title: string;

  /** Texto visible. */
  @Column({ type: 'text' })
  body: string;

  /** Clave para la navegación: { type, entityId, companyId? }. */
  @Column({ type: 'json', nullable: true })
  data: NotificationData | null;

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
