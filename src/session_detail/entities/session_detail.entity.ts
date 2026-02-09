import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('session_detail')
export class SessionDetail {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'cost', type: 'decimal', nullable: true })
  cost: number;

  @PrimaryColumn({ name: 'service_id' })
  serviceId: number;

  @PrimaryColumn({ name: 'company_worker_id' })
  companyWorkerId: number;

  @PrimaryColumn({ name: 'session_id' })
  sessionId: number;

  @Column({ name: 'start_datetime', nullable: true })
  startDatetime: Date;

  @Column({ name: 'total_time', nullable: true })
  totalTime: number;

  @Column({ name: 'total_worker', type: 'decimal', nullable: true })
  totalWorker: number;

  @Column({ name: 'total_company', type: 'decimal', nullable: true })
  totalCompany: number;

  @Column({ name: 'status', nullable: true })
  status: number;

 // Nuevo campo para identificar servicios extras
  @Column({ name: 'is_extra', default: false })
  isExtra: boolean;


  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;


}
