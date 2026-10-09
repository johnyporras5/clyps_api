import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Worker } from '../../worker/entities/worker.entity';
import { Company } from '../../company/entities/company.entity';

@Entity('company_worker')
@Index('UQ_company_worker_company_slug', ['companyId', 'slug'], {
  unique: true,
})
export class CompanyWorker {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'worker_id' })
  workerId: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'is_active', nullable: true })
  isActive: number;

  // Segmento del enlace de reservas del profesional
  // (/reservar/<negocio>/<slug>). Único dentro del negocio; se genera al
  // crear el registro (CompanyWorkerSubscriber) y no cambia con el nombre.
  @Column({ name: 'slug', type: 'varchar', length: 160, nullable: true })
  slug: string | null;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: Date;

  @Column({ name: 'services_detail', type: 'json', nullable: true })
  servicesDetail: any;

  // Usuario del trabajador. NULL mientras no tenga cuenta (sin correo).
  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ name: 'calendar', type: 'json', nullable: true })
  calendar: any;

  @Column({ name: 'temporarily_deleted', type: 'boolean', default: false })
  temporarilyDeleted: boolean;

  @Column({ name: 'permanently_deleted', type: 'boolean', default: false })
  permanentlyDeleted: boolean;

  @ManyToOne(() => Worker, { eager: true })
  @JoinColumn({ name: 'worker_id' })
  worker: Worker;

  @ManyToOne(() => Company, { eager: true })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
