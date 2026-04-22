import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { Client } from '../../client/entities/client.entity';
import { Company } from '../../company/entities/company.entity';

@Entity('client_favorite_company')
@Unique('UQ_client_favorite_company_client_company', ['clientId', 'companyId'])
@Index('IDX_client_favorite_company_client', ['clientId'])
@Index('IDX_client_favorite_company_company', ['companyId'])
export class ClientFavoriteCompany {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'client_id', type: 'int' })
  clientId: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
