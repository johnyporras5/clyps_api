import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { moneyTransformer } from '../../payroll/payroll-money.util';
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

  // → catálogo de categorías de caja (su propio ticket). Sin FK todavía.
  @Column({ name: 'category_id', type: 'int' })
  categoryId: number;

  // Monto en céntimos de Bs. SIEMPRE positivo, también en los gastos.
  @Column({
    name: 'amount_minor',
    type: 'bigint',
    transformer: moneyTransformer,
  })
  amountMinor: number;

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

  // Etiqueta informativa (v1): marca "esto se repite todos los meses". NO
  // genera movimientos automáticos ni hay job que la lea.
  @Column({ name: 'is_recurring', type: 'tinyint', default: 0 })
  isRecurring: boolean;

  // Quién lo registró (auditoría).
  @Column({ name: 'created_by_user_id', type: 'int' })
  createdByUserId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
