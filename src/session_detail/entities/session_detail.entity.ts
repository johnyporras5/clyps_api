import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('session_detail')
export class SessionDetail {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'cost', type: 'decimal', nullable: true })
  cost: number;

  @PrimaryColumn({ name: 'service_id' })
  serviceId: number;

  @Column({ name: 'company_worker_id', nullable: true })
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

  @Column({ name: 'description_worker', type: 'text', nullable: true })
  descriptionWorker: string;

  @Column({ name: 'description_ia', type: 'text', nullable: true })
  descriptionIA: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  // Motivo de cancelación del servicio (se llena al pasar el detalle a status 5)
  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string | null;

  // Nuevo campo para identificar servicios extras
  @Column({ name: 'is_extra', default: false })
  isExtra: boolean;

  @Column({ name: 'end_datetime', nullable: true })
  endDatetime: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'offer_id', nullable: true })
  offerId: number;
}
