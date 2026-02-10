import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, OneToMany, OneToOne, JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { WorkerFeedback } from '../../worker_feedback/entities/worker_feedback.entity';

@Entity('worker')
export class Worker {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', length: 145, nullable: true })
  name: string;

  @Column({ name: 'last_name', length: 145, nullable: true })
  lastName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string;

  @Column({ name: 'address', length: 145, nullable: true })
  address: string;

  @Column({ name: 'birthdate', type: 'date', nullable: true })
  birthdate: Date;

  @Column({ name: 'picture', length: 255, nullable: true })
  picture: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_active', type: 'tinyint', default: 1 })
  isActive: number;

  @Column({ name: 'location', length: 145, nullable: true })
  location: string;

  // Relación uno a uno con User
  @OneToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', unique: true })
  userId: number;


  @OneToMany(() => WorkerFeedback, (feedback) => feedback.worker)
  feedbacks?: WorkerFeedback[];
}
