import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { Service } from '../../service/entities/service.entity';

@Entity('service_category')
export class ServiceCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', length: 145, nullable: false })
  name: string;

  @Column({ name: 'company_id', nullable: false })
  companyId: number;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => Service, (service) => service.category)
  services: Service[];
}