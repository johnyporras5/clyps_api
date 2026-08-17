import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';

/**
 * CLYP-319: categoría de productos por tenant (company). Agrupa el catálogo y
 * puede llevar un % de comisión por defecto para prellenar productos nuevos.
 */
@Entity('product_category')
export class ProductCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', length: 145, nullable: false })
  name: string;

  // Tenant: la company dueña de la categoría.
  @Column({ name: 'company_id', nullable: false })
  companyId: number;

  // Comisión por defecto en basis points (1000 = 10%) para prellenar productos
  // nuevos de esta categoría. Opcional (null = sin default).
  @Column({ name: 'default_commission_bps', type: 'int', nullable: true })
  defaultCommissionBps: number | null;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  // CLYP-320: aquí irá `@OneToMany(() => Product, ...)` cuando exista la entidad
  // Product; la usa la validación de borrado (no eliminar con productos).
}
