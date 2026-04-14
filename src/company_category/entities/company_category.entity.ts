import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../company/entities/company.entity';

@Entity('company_category')
export class CompanyCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', length: 145, nullable: false })
  name: string;

  @Column({ name: 'company_id', nullable: false })
  companyId: number;

  @ManyToOne(() => Company, (company) => company.categories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}