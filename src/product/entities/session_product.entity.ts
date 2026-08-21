import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { moneyTransformer } from '../../payroll/payroll-money.util';
import { Product } from './product.entity';
import { CompanyWorker } from '../../company_worker/entities/company_worker.entity';

/**
 * CLYP-321: registro ÚNICO de venta de producto. Cada fila ES una venta y
 * congela precio/costo/comisión/moneda para el reporte. Dos tipos (`sale_type`):
 *  - 'client': vendido en el cobro de una cita (`session_id` set, `seller`).
 *  - 'worker_purchase': un trabajador se lo compró a sí mismo (`session_id` null,
 *    `buyer`), se deduce de su nómina y no genera comisión.
 * Los conceptos de comisión de la venta a cliente NO se generan aquí — salen de
 * las atribuciones del payload (CLYP-318), que trazan a esta fila vía sourceId.
 */
@Entity('session_product')
@Index('IDX_session_product_session', ['sessionId'])
@Index('IDX_session_product_company', ['companyId'])
export class SessionProduct {
  @PrimaryGeneratedColumn()
  id: number;

  // Tenant (company dueña de la venta).
  @Column({ name: 'company_id' })
  companyId: number;

  // Cita donde se vendió (solo saleType='client'). null en compras de trabajador.
  @Column({ name: 'session_id', type: 'int', nullable: true })
  sessionId: number | null;

  // 'client' (venta en cita) o 'worker_purchase' (consumo del trabajador).
  @Column({ name: 'sale_type', type: 'varchar', length: 20, default: 'client' })
  saleType: 'client' | 'worker_purchase';

  @Column({ name: 'product_id' })
  productId: number;

  @Column({ name: 'quantity', type: 'int' })
  quantity: number;

  // Precio unitario congelado, en unidades mínimas de `currency` (editable en el
  // cobro; por defecto el del catálogo).
  @Column({
    name: 'unit_price_minor',
    type: 'bigint',
    transformer: moneyTransformer,
  })
  unitPriceMinor: number;

  // Moneda congelada de la venta (el producto podría cambiar después).
  @Column({ name: 'currency', length: 10, default: 'VES' })
  currency: string;

  // Costo congelado al momento de la venta (unidades mínimas de `currency`).
  @Column({
    name: 'cost_minor',
    type: 'bigint',
    default: 0,
    transformer: moneyTransformer,
  })
  costMinor: number;

  // Comisión del vendedor CONGELADA para esta venta (unidades mínimas de
  // `currency`). 0 en compras de trabajador o sin comisión.
  @Column({
    name: 'commission_minor',
    type: 'bigint',
    default: 0,
    transformer: moneyTransformer,
  })
  commissionMinor: number;

  // Quién lo vendió (company_worker). null = "nadie / sin comisión". No tiene
  // que ser el ejecutor del servicio.
  @Column({ name: 'seller_employee_id', type: 'int', nullable: true })
  sellerEmployeeId: number | null;

  // Comprador cuando saleType='worker_purchase' (company_worker). null en ventas
  // a cliente.
  @Column({ name: 'buyer_employee_id', type: 'int', nullable: true })
  buyerEmployeeId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Product, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => CompanyWorker, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'seller_employee_id' })
  seller: CompanyWorker | null;

  @ManyToOne(() => CompanyWorker, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'buyer_employee_id' })
  buyer: CompanyWorker | null;
}
