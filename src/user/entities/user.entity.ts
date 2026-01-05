import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, OneToMany } from 'typeorm';
import { Worker } from '../../worker/entities/worker.entity';
import { Client } from '../../client/entities/client.entity';
import { UserVerificationCodes } from '../../user-verification-codes/entities/user-verification-codes.entity';

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

 
  @Column({ name: 'last_login', type: 'datetime', nullable: true })
  lastLogin: Date;

  @Column({ name: 'last_logout', type: 'datetime', nullable: true })
  lastLogout: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

   @Column({ name: 'email_verified', type: 'tinyint', default: 0 })
  emailVerified: number; // 0 = false, 1 = true

 @OneToOne(() => Worker, worker => worker.user, { nullable: true, cascade:true })
  worker?: Worker;

  @OneToOne(() => Client, client => client.user, { nullable: true, cascade:true })
  client?: Client;

  @OneToMany(() => UserVerificationCodes, verificationCode => verificationCode.user)
  verificationCodes: UserVerificationCodes[];


}
