import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { Client } from '../../client/entities/client.entity';

@Entity('company_feedback')
export class CompanyFeedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  stars?: number | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @CreateDateColumn({ name: 'datetime', type: 'timestamp' })
  datetime: Date;

  @ManyToOne(() => Company, (company) => company.feedbacks ?? [], {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  client?: Client & { pictureUrl?: string };

  @Column({ name: 'client_id', type: 'int', nullable: true })
  clientId?: number | null;

  @Column({ name: 'session_id', type: 'int', nullable: true })
  sessionId?: number | null;

  // Hidratado en runtime con los servicios prestados en la sesión asociada
  // (sólo se llena cuando hay sessionId).
  services?: Array<{
    id: number;
    name: string | null;
    category: { id: number; name: string } | null;
    worker: { id: number; name: string | null } | null;
  }>;
}
