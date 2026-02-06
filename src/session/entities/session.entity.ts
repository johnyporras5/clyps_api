import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('session')
export class Session {

  @PrimaryGeneratedColumn()
  id: number;

  @PrimaryColumn({ name: 'client_id' })
  clientId: number;

  @Column({ name: 'session_datetime', nullable: true })
  sessionDatetime: Date;

  @Column({ name: 'session_status', nullable: true })
  sessionStatus: number;

  @Column({ name: 'total_cost', type: 'decimal', nullable: true })
  totalCost: number;

  @Column({ name: 'total_time', nullable: true })
  totalTime: number;

  @Column({ name: 'ia_response', type: 'json', nullable: true })
  iaResponse: any;

  @Column({ name: 'start_datetime', nullable: true })
  startDatetime: Date;

  @Column({ name: 'status', nullable: true })
  status: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'description_worker', type: 'text', nullable: true })
  descriptionWorker: string;

  @Column({ name: 'description_ia', type: 'text', nullable: true })
  descriptionIA: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

}
