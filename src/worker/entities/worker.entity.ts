import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,OneToOne,JoinColumn} from 'typeorm';
import { User } from '../../user/entities/user.entity'; 
@Entity('worker')
export class Worker {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', length: 145, nullable: true })
  name: string;

  @Column({ name: 'last_name', length: 145, nullable: true })
  lastName: string;

  @Column({ name: 'address', length: 145, nullable: true })
  address: string;

  @Column({ name: 'birthdate', type: 'date', nullable: true })
  birthdate: Date;

  @Column({ name: 'picture', length: 45, nullable: true })
  picture: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

   // Relación uno a uno con User
  @OneToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', unique: true })
  userId: number;
}
