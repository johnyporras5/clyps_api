import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type CampaignEmailStatus = 'sending' | 'sent' | 'failed';

/** Un correo de campaña a un salón. Ver la migración ...085. */
@Entity('campaign_email_log')
export class CampaignEmailLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'campaign', type: 'varchar', length: 40 })
  campaign: string;

  @Column({ name: 'email', type: 'varchar', length: 245 })
  email: string;

  @Column({ name: 'status', type: 'varchar', length: 12, default: 'sending' })
  status: CampaignEmailStatus;

  @Column({ name: 'error', type: 'varchar', length: 255, nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @Column({ name: 'sent_at', type: 'datetime', nullable: true })
  sentAt: Date | null;
}
