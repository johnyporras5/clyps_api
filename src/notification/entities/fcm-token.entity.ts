import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

/** Plataforma del dispositivo dueño del token (CLYP-257 / §1). */
export type FcmPlatform = 'android' | 'ios' | 'web';

/**
 * Token FCM de un dispositivo/navegador. Un usuario puede tener VARIOS tokens
 * (varios dispositivos); `token` es ÚNICO globalmente (upsert por token).
 */
@Entity('fcm_tokens')
export class FcmToken {
  @PrimaryGeneratedColumn()
  id: number;

  /** Dueño del dispositivo. */
  @Index('IDX_fcm_tokens_user')
  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Token FCM (móvil o web). Único globalmente. */
  @Column({ length: 512, unique: true })
  token: string;

  @Column({ length: 10 })
  platform: FcmPlatform;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
