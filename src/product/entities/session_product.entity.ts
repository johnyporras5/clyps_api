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
 * CLYP-321: producto vendido en el cobro de una sesión (hermana de
 * session_detail, que sigue siendo solo servicios). Cada fila ES una venta:
 * congela precio/moneda, guarda el vendedor y sostiene el stock. Los conceptos
 * de comisión NO se generan aquí — salen de las atribuciones del payload en
 * CLYP-318, que trazan a esta fila vía sourceId.
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

  @Column({ name: 'session_id' })
  sessionId: number;

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

  // Quién lo vendió (company_worker). null = "nadie / sin comisión". No tiene
  // que ser el ejecutor del servicio.
  @Column({ name: 'seller_employee_id', type: 'int', nullable: true })
  sellerEmployeeId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Product, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => CompanyWorker, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'seller_employee_id' })
  seller: CompanyWorker | null;
}
