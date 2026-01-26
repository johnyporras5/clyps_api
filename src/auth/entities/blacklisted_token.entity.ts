import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('blacklisted_tokens')
export class BlacklistedToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  token: string;

  @Column({ type: 'bigint' })
  expiresAt: number; 

  @Column({ nullable: true })
  userId: number;

  @Column({ length: 255, nullable: true })
  reason: string; 

  @CreateDateColumn()
  createdAt: Date;

  @Index()
  @Column({ type: 'datetime', nullable: true })
  clearedAt: Date; // Fecha cuando se limpió (para limpieza periódica)
}