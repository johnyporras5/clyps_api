import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';

@Entity('calendar_company')
export class CalendarCompany {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'calendar_detail', type: 'json', nullable: true })
  calendarDetail: any;

  @Column({ name: 'status', length: 45, nullable: true })
  status: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company, (company) => company.calendars)
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
