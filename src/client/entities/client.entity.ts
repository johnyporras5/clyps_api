import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, OneToOne,JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('client')
export class Client {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', length: 145, nullable: true })
  name: string;

  @Column({ name: 'last_name', length: 145, nullable: true })
  lastName: string;

  @Column({ name: 'email', length: 145, nullable: true })
  email: string;

  @Column({ name: 'location', length: 245, nullable: true })
  location: string;

  @Column({ name: 'user_id' })
  userId: number;

  // Relación uno a uno con User
  @OneToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
