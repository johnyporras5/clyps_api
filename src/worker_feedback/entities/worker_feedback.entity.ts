import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Worker } from '../../worker/entities/worker.entity';

@Entity('worker_feedback')
export class WorkerFeedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  stars?: number | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @CreateDateColumn({ name: 'datetime', type: 'timestamp' })
  datetime: Date;

  @ManyToOne(() => Worker, (worker) => worker.feedbacks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worker_id' })
  worker: Worker;

  @Column({ name: 'worker_id', type: 'int' })
  workerId: number;

  @Column({ name: 'client_id', type: 'int', nullable: true })
  clientId?: number | null;
}
