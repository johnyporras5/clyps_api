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
 *
 * Mapa de navegación que ya implementa la app (CLYP-261 / §5):
 *   appointment | reminder | assignment → Detalle de la cita (entityId = id de la cita)
 *   offer                                → Pantalla de ofertas
 *   review                               → Pantalla de reseñas
 *   system                               → (sin navegación específica)
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
 * `companyId` = opcional, contexto.
 *
 * En FCM todos los values van como string ("243"); la app los castea. La
 * conversión la hace `stringifyValues` en NotificationService (CLYP-260).
 */
export interface NotificationData {
  type: NotificationType;
  entityId?: number;
  companyId?: number;
  [key: string]: unknown;
}

/**
 * Construye el payload `data` de navegación de forma consistente (CLYP-261 / §5).
 * Úsalo en el catálogo (§6) en vez de escribir el objeto a mano, así nunca se
 * olvida un campo. `type` SIEMPRE debe coincidir con el type de la notificación.
 */
export function buildNavigationData(
  type: NotificationType,
  entityId?: number,
  companyId?: number,
): NotificationData {
  const data: NotificationData = { type };
  if (entityId !== undefined && entityId !== null) data.entityId = entityId;
  if (companyId !== undefined && companyId !== null) data.companyId = companyId;
  return data;
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
