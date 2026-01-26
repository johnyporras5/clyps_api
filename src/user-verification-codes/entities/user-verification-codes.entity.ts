import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('user_verification_codes')
export class UserVerificationCodes {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'code', length: 6 })
  code: string;

  @Column({ name: 'expires_at' })
  expiresAt: Date;

  @Column({ name: 'used', type: 'tinyint', default: 0 })
  used: number; // 0 = false, 1 = true

  @Column({
    name: 'code_type',
    type: 'varchar',
    length: 50,
    default: 'email_verification'
  })
  codeType: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, user => user.verificationCodes)
  @JoinColumn({ name: 'user_id' })
  user: User;
}