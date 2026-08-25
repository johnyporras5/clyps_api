import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Venta directa de productos a un cliente SIN cita (walk-in). Es la cabecera de
 * la transacción: guarda el pago (método, moneda(s), Total en Bs, deuda) igual
 * que `session_payments`, pero sin depender de una sesión. Las líneas de la
 * venta viven en `session_product` (sale_type='client', session_id NULL) con su
 * `direct_sale_id` apuntando aquí; las comisiones/propinas van a nómina como
 * conceptos con sourceType='direct_sale'.
 */
@Entity('direct_sale')
@Index('IDX_direct_sale_company', ['companyId'])
export class DirectSale {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  // Cliente al que se le vendió. Nullable para permitir una venta sin cliente
  // registrado (walk-in anónimo).
  @Column({ name: 'client_id', type: 'int', nullable: true })
  clientId: number | null;

  // Método de pago (enum PAYMENT_METHODS del cobro). Opcional.
  @Column({ name: 'method', type: 'varchar', length: 30, nullable: true })
  method: string | null;

  @Column({ name: 'reference', type: 'varchar', length: 64, nullable: true })
  reference: string | null;

  // Total cobrado en Bs (referencia/caja).
  @Column({
    name: 'total_bs',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  totalBs: number | null;

  // Detalle del pago por moneda: [{ currency, subtotal, exchangeRate, subtotalBs }].
  @Column({ name: 'lines', type: 'json', nullable: true })
  lines: unknown;

  // NULL = el cliente aún no pagó (deuda). Set = pagado en esa fecha.
  @Column({ name: 'collected_at', type: 'datetime', nullable: true })
  collectedAt: Date | null;

  // Marca la venta como cuenta por cobrar durante toda su vida (aunque se salde).
  @Column({ name: 'was_pending', type: 'tinyint', default: 0 })
  wasPending: boolean;

  // Ajuste a favor/en contra de la company en Bs (sobre/faltante).
  @Column({
    name: 'company_adjustment_bs',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  companyAdjustmentBs: number | null;

  @Column({ name: 'created_by_user_id', type: 'int', nullable: true })
  createdByUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
