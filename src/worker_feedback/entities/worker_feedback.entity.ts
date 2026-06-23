import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Worker } from '../../worker/entities/worker.entity';
import { Client } from '../../client/entities/client.entity';

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

  @ManyToOne(() => Worker, (worker) => worker.feedbacks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'worker_id' })
  worker: Worker;

  @Column({ name: 'worker_id', type: 'int' })
  workerId: number;

  client?: Client & { pictureUrl?: string };

  @Column({ name: 'client_id', type: 'int', nullable: true })
  clientId?: number | null;

  @Column({ name: 'session_id', type: 'int', nullable: true })
  sessionId?: number | null;

  // Hidratado en runtime con los servicios prestados por este worker en la
  // sesión asociada (sólo se llena cuando hay sessionId).
  services?: Array<{
    id: number;
    name: string | null;
    category: { id: number; name: string } | null;
  }>;
}
