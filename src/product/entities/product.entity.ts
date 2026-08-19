import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { ProductCategory } from '../../product_category/entities/product_category.entity';
import { moneyTransformer } from '../../payroll/payroll-money.util';

/**
 * CLYP-320: producto del catálogo por tenant (company). Se vende en el cobro
 * (CLYP-321), descuenta stock y puede dar comisión al vendedor.
 */
@Entity('product')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'category_id' })
  categoryId: number;

  @Column({ name: 'name', length: 145 })
  name: string;

  // Moneda del precio (como los servicios). El precio va en unidades mínimas de
  // ESTA moneda.
  @Column({ name: 'currency', length: 10, default: 'VES' })
  currency: string;

  // Precio de venta en unidades mínimas (céntimos) de `currency`.
  @Column({
    name: 'sale_price_minor',
    type: 'bigint',
    transformer: moneyTransformer,
  })
  salePriceMinor: number;

  // Costo del producto para la company (lo que le costó reponerlo), en unidades
  // mínimas de `currency`. Variable en el tiempo; se CONGELA en cada venta.
  // La ganancia de la company = precio − costo − comisión (derivada). 0 = sin costo.
  @Column({
    name: 'cost_minor',
    type: 'bigint',
    default: 0,
    transformer: moneyTransformer,
  })
  costMinor: number;

  // Cómo se calcula la comisión del vendedor: 'percentage' (usa commission_bps,
  // % del precio de venta) o 'fixed' (usa commission_fixed_minor por unidad).
  @Column({
    name: 'commission_mode',
    type: 'varchar',
    length: 12,
    default: 'percentage',
  })
  commissionMode: 'percentage' | 'fixed';

  // Comisión fija POR UNIDAD (si commission_mode='fixed'), en unidades mínimas
  // de `currency`. Aplica solo si appliesCommission.
  @Column({
    name: 'commission_fixed_minor',
    type: 'bigint',
    default: 0,
    transformer: moneyTransformer,
  })
  commissionFixedMinor: number;

  // Unidades disponibles. Puede quedar negativo si la company permite vender sin
  // stock (company.allowNegativeStock); si no, la venta se bloquea (CLYP-321).
  @Column({ name: 'stock', type: 'int', default: 0 })
  stock: number;

  // ¿Da comisión al vendedor al venderse?
  @Column({ name: 'applies_commission', type: 'boolean', default: false })
  appliesCommission: boolean;

  // % de comisión en basis points (1000 = 10%). Aplica solo si
  // appliesCommission. Al crear puede heredar el default de la categoría.
  // null = sin % definido.
  @Column({ name: 'commission_bps', type: 'int', nullable: true })
  commissionBps: number | null;

  // Activo/inactivo: desactivar lo saca del flujo de venta sin borrarlo (no
  // toca stock ni histórico).
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => ProductCategory, (c) => c.products, {
    onDelete: 'NO ACTION',
  })
  @JoinColumn({ name: 'category_id' })
  category: ProductCategory;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
