import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ServiceStatus } from '../enum/service-status.enum';
import { ServiceCategory } from '../../service_category/entities/service_category.entity';

@Entity('service')
export class Service {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', length: 145, nullable: true })
  name: string;

  @Column({ name: 'cost', type: 'decimal', nullable: true })
  cost: number;

  @Column({ name: 'standard_time', nullable: true })
  standardTime: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({
    type: 'json',
    nullable: true,
  })
  workers: Array<{
    id: number;
    percentage: number;
    time?: number;
  }>;

  @Column({ name: 'currency', length: 10, nullable: true, default: 'VES' })
  currency: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'percentage', type: 'decimal', nullable: true })
  percentage: number;

  @Column({ name: 'status', nullable: true, default: ServiceStatus.ACTIVE })
  status: number;

  // Servicio "para la comunidad": gestionado directamente por admin/worker y
  // oculto para el cliente. Por defecto false (servicio normal y visible).
  @Column({ name: 'for_community', type: 'boolean', default: false })
  forCommunity: boolean;

  constructor() {
    this.workers = [];
    this.status = ServiceStatus.ACTIVE;
    this.forCommunity = false;
  }

  @Column({ name: 'category_id', nullable: true })
  categoryId: number;

  @ManyToOne(() => ServiceCategory, (category) => category.services, {
    nullable: true,
    eager: true,
  })
  @JoinColumn({ name: 'category_id' })
  category: ServiceCategory;
}
