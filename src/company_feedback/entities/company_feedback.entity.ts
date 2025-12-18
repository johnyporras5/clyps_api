import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('company_feedback')
export class CompanyFeedback {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'stars', nullable: true })
  stars: number;

  @Column({ name: 'datetime', nullable: true })
  datetime: Date;

  @PrimaryColumn({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'client_id', nullable: true })
  clientId: number;
}
