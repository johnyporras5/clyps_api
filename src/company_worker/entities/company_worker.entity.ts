import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('company_worker')
export class CompanyWorker {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'worker_id' })
  workerId: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'is_active', nullable: true })
  isActive: number;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: Date;

  @Column({ name: 'services_detail', type: 'json', nullable: true })
  servicesDetail: any;

  @Column({ name: 'user_id', nullable: true })
  userId: number;
}
