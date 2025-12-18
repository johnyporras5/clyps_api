import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('worker_feedback')
export class WorkerFeedback {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'stars', nullable: true })
  stars: number;

  @Column({ name: 'datetime', nullable: true })
  datetime: Date;

  @PrimaryColumn({ name: 'worker_id' })
  workerId: number;

  @Column({ name: 'client_id', nullable: true })
  clientId: number;
}
