import { CompanyFeedback } from '../../company_feedback/entities/company_feedback.entity';
import { CalendarCompany } from '../../calendar_company/entities/calendar-company.entity';
import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, OneToMany, UpdateDateColumn } from 'typeorm';

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

  @Column({ name: 'manager_name', length: 145, nullable: true })
  managerName: string;

  @Column({ name: 'instagram_url', length: 245, nullable: true })
  instagramUrl: string;

  @Column({ name: 'tiktok_url', length: 245, nullable: true })
  tiktokUrl: string;

  @Column({ name: 'facebook_url', length: 245, nullable: true })
  facebookUrl: string;

  @Column({ name: 'phone', length: 20, nullable: true })
  phone: string;


  @OneToMany(() => CalendarCompany, (calendar) => calendar.company, { cascade: true })
  calendars: CalendarCompany[];

  @OneToMany(() => CompanyFeedback, (f) => f.company)
  feedbacks?: CompanyFeedback[];
}
