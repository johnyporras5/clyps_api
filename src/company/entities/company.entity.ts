import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('company')
export class Company {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', length: 145, nullable: true })
  name: string;

  @Column({ name: 'location', length: 145, nullable: true })
  location: string;

  @Column({ name: 'email', length: 145, nullable: true })
  email: string;

  @Column({ name: 'logo', length: 245, nullable: true })
  logo: string;

  @Column({ name: 'description', length: 45, nullable: true })
  description: string;

  @Column({ name: 'user_id', nullable: true })
  userId: number;
}
