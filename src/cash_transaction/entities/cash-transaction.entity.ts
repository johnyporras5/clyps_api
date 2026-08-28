import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { moneyTransformer } from '../../payroll/payroll-money.util';
import { CashCategory } from '../../cash_category/entities/cash-category.entity';
import {
  cleanSupplierName,
  normalizeSupplierName,
} from '../cash-supplier.util';
import type {
  CashTransactionKind,
  CashPaymentMethod,
} from '../cash-transaction.enums';

/**
 * Un movimiento de caja de la company: ingreso o gasto (CLYP-352).
 *
 * Hay UN solo tipo de registro para los dos. Gasto e ingreso comparten tabla,
 * columnas y reglas; lo único que los separa es `kind`. Por eso no existe un
 * módulo "gastos" y otro "ingresos": duplicarían todo para diferir en un signo.
 *
 * INVARIANTE: `amount_minor` es SIEMPRE positivo (lo respalda un CHECK en la
 * migración). El signo se deriva de `kind` al agregar — ver `signedAmountMinor`
 * en `cash-transaction.util.ts`.
 *
 * Todo movimiento está scoped por `company_id` (el tenant): ninguna consulta de
 * caja debe correr sin filtrar por él.
 */
@Entity('cash_transaction')
// La consulta natural de caja es "movimientos de esta company en este rango".
@Index('IDX_cash_transaction_company_date', ['companyId', 'date'])
// Autocompletado y agrupado de proveedores (CLYP-355).
@Index('IDX_cash_transaction_company_supplier', ['companyId', 'supplierKey'])
export class CashTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  // 'income' | 'expense'. Único discriminador del movimiento.
  @Column({ name: 'kind', type: 'varchar', length: 10 })
  kind: CashTransactionKind;

  // Descripción libre de qué se pagó o cobró ("Alquiler de agosto").
  @Column({ name: 'concept', type: 'varchar', length: 145 })
  concept: string;

  // → cash_category. La FK es RESTRICT: una categoría en uso no se puede borrar.
  @Column({ name: 'category_id', type: 'int' })
  categoryId: number;

  // Se carga solo en el listado y el detalle, y con las dos columnas que el
  // front necesita para pintar la fila: así no tiene que cruzar cada movimiento
  // contra el catálogo por su cuenta.
  @ManyToOne(() => CashCategory)
  @JoinColumn({ name: 'category_id' })
  category?: CashCategory;

  // Monto en céntimos de SU moneda (`currency`). SIEMPRE positivo, también en
  // los gastos.
  @Column({
    name: 'amount_minor',
    type: 'bigint',
    transformer: moneyTransformer,
  })
  amountMinor: number;

  // Moneda del movimiento. VES por defecto: la caja del salón es en Bs y el
  // resto es la excepción.
  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'VES' })
  currency: string;

  // Tasa histórica (Bs por 1 unidad de `currency`) al registrar el movimiento.
  // NUNCA se recalcula con tasas futuras. null cuando la moneda ya es VES.
  @Column({
    name: 'exchange_rate',
    type: 'decimal',
    precision: 18,
    scale: 4,
    nullable: true,
  })
  exchangeRate: number | null;

  // Equivalente en céntimos de Bs. Es lo que suman los reportes: permite
  // totalizar una caja con movimientos en varias monedas. = amount_minor si es
  // VES.
  @Column({
    name: 'amount_bs_minor',
    type: 'bigint',
    transformer: moneyTransformer,
  })
  amountBsMinor: number;

  // Fecha contable del movimiento (YYYY-MM-DD), no la de captura: un gasto se
  // registra tarde y aun así pertenece al día en que ocurrió.
  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({ name: 'payment_method', type: 'varchar', length: 20 })
  paymentMethod: CashPaymentMethod;

  // Referencia del pago móvil/transferencia. Opcional (el efectivo no tiene).
  @Column({
    name: 'payment_reference',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  paymentReference: string | null;

  // Texto libre: en v1 NO hay tabla de proveedores, se escribe el nombre.
  @Column({
    name: 'supplier_name',
    type: 'varchar',
    length: 145,
    nullable: true,
  })
  supplierName: string | null;

  // Versión normalizada de `supplier_name` (CLYP-355): es lo que agrupa
  // "Ferretería López" con "ferreteria lopez" en el autocompletado y en los
  // reportes. No se recibe del cliente — se deriva sola en @BeforeInsert.
  // Collation binaria a propósito: la tabla es utf8mb4_unicode_ci, que al
  // comparar funde 'ñ' con 'n' y anularía la normalización de la app (agruparía
  // "Peña" con "Pena"). Aquí la comparación tiene que ser exacta.
  @Column({
    name: 'supplier_key',
    type: 'varchar',
    length: 145,
    collation: 'utf8mb4_bin',
    nullable: true,
  })
  supplierKey: string | null;

  // Etiqueta informativa (v1): marca "esto se repite todos los meses". NO
  // genera movimientos automáticos ni hay job que la lea.
  // `boolean` y no `tinyint` a propósito: así la API responde true/false, igual
  // que `cash_category.is_active`, y no un 0/1 que el front tenga que traducir.
  @Column({ name: 'is_recurring', type: 'boolean', default: false })
  isRecurring: boolean;

  // Quién lo registró (auditoría).
  @Column({ name: 'created_by_user_id', type: 'int' })
  createdByUserId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Mantiene `supplier_key` y `supplier_name` en sincronía sin que nadie tenga
   * que acordarse: el nombre se limpia de espacios sobrantes y la clave se
   * deriva de él en cada guardado.
   */
  @BeforeInsert()
  @BeforeUpdate()
  syncSupplierKey(): void {
    this.supplierName = cleanSupplierName(this.supplierName);
    this.supplierKey = normalizeSupplierName(this.supplierName);
  }
}
