import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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
}
