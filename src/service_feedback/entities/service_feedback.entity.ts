import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Service } from '../../service/entities/service.entity';
import { Client } from '../../client/entities/client.entity';

@Entity('service_feedback')
export class ServiceFeedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  stars?: number | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @CreateDateColumn({ name: 'datetime', type: 'timestamp' })
  datetime: Date;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @Column({ name: 'service_id', type: 'int' })
  serviceId: number;

  client?: Client & { pictureUrl?: string };

  @Column({ name: 'client_id', type: 'int', nullable: true })
  clientId?: number | null;
}
