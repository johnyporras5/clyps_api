import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('user')
export class User {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'username', length: 145, nullable: true })
  username: string;

  @Column({ name: 'email', length: 245, nullable: true })
  email: string;

  @Column({ name: 'password', length: 250, nullable: true })
  password: string;

  @Column({ name: 'user_type', length: 5, nullable: true })
  userType: string;


  @Column({ name: 'email_verified', default: 0 })
  emailVerified: number;

  @Column({ name: 'last_login', type: 'datetime', nullable: true })
  lastLogin: Date;

  @Column({ name: 'last_logout', type: 'datetime', nullable: true })
  lastLogout: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
