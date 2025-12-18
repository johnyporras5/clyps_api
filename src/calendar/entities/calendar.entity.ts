import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('calendar')
export class Calendar {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'calendar_detail', type: 'json', nullable: true })
  calendarDetail: any;

  @Column({ name: 'status', length: 45, nullable: true })
  status: string;

  @PrimaryColumn({ name: 'company_worker_id' })
  companyWorkerId: number;
}
