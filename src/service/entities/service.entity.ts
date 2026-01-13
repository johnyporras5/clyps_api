import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('service')
export class Service {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', length: 145, nullable: true })
  name: string;

  @Column({ name: 'cost', type: 'decimal', nullable: true })
  cost: number;

  @Column({ name: 'standard_time', nullable: true })
  standardTime: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({
    type: 'json',
    nullable: true,
    default: '[]'
  })
  workers: Array<{
    id: number;
    percentage: number;
  }>;

  @Column({ name: 'currency', length: 10, nullable: true, default: 'VES' })
  currency: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'percentage', type: 'decimal', nullable: true })
  percentage: number;
}
