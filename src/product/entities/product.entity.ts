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

  @ManyToOne(() => ProductCategory, (c) => c.products, {
    onDelete: 'NO ACTION',
  })
  @JoinColumn({ name: 'category_id' })
  category: ProductCategory;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
