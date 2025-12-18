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

  @PrimaryColumn({ name: 'company_id' })
  companyId: number;
}
