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
}
