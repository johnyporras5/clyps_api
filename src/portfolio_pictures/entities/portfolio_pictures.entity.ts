import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('portfolio_pictures')
export class PortfolioPictures {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'picture', length: 145, nullable: true })
  picture: string;

  @PrimaryColumn({ name: 'worker_id' })
  workerId: number;
}
