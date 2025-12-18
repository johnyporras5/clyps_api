import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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
}
