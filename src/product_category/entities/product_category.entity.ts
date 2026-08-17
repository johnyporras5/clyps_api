import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { Product } from '../../product/entities/product.entity';

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

  // Activa/inactiva: desactivar la saca del flujo de venta sin borrarla.
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];
}
