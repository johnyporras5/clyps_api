import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type StandingCommissionScope = 'all_services' | 'service';
export type StandingCommissionBasis = 'percentage' | 'fixed';

/**
 * Comisión fija (recurrente) de un trabajador sobre servicios, INDEPENDIENTE de
 * quién ejecuta. En cada cobro se expande como una atribución de comisión más
 * (mismo motor que las manuales) y se RESTA de la parte de la compañía.
 *
 * Modelos que cubre una sola tabla:
 *  - Global: scope='all_services', service_id NULL → aplica a todos los
 *    servicios (incluidos los futuros).
 *  - Específica: scope='service', service_id set → aplica solo a ese servicio;
 *    si el trabajador también tiene global, la específica MANDA (no se suma).
 *  - Exclusión: scope='service', is_exclusion=1 → el trabajador NO recibe su
 *    comisión global en ese servicio ("todos menos este").
 *
 * Solo servicios (no productos). Solo comisión (no propinas).
 */
@Entity('standing_commission')
@Index('IDX_standing_commission_company', ['companyId'])
@Index('IDX_standing_commission_worker', ['companyWorkerId'])
@Index('IDX_standing_commission_role', ['commissionRoleId'])
@Index('IDX_standing_commission_service', ['serviceId'])
export class StandingCommission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  // Trabajador que RECIBE la comisión (puede no ejecutar el servicio). NULL en
  // filas "por rol": ahí la persona se elige en cada cobro.
  @Column({ name: 'company_worker_id', type: 'int', nullable: true })
  companyWorkerId: number | null;

  // Rol genérico (fila "por rol"). NULL en filas "por persona". Excluyentes.
  @Column({ name: 'commission_role_id', type: 'int', nullable: true })
  commissionRoleId: number | null;

  @Column({
    name: 'scope',
    type: 'enum',
    enum: ['all_services', 'service'],
  })
  scope: StandingCommissionScope;

  // Servicio puntual (scope='service' o exclusión). NULL para la regla global.
  @Column({ name: 'service_id', type: 'int', nullable: true })
  serviceId: number | null;

  // 1 = quita la comisión global del trabajador en este servicio (scope='service').
  @Column({ name: 'is_exclusion', type: 'tinyint', default: 0 })
  isExclusion: boolean;

  // Base del cálculo. NULL en filas de exclusión (no llevan monto).
  @Column({
    name: 'basis_mode',
    type: 'enum',
    enum: ['percentage', 'fixed'],
    nullable: true,
  })
  basisMode: StandingCommissionBasis | null;

  // percentage → basis points (10% = 1000). fixed → monto en céntimos (minor).
  @Column({ name: 'value', type: 'int', nullable: true })
  value: number | null;

  // Moneda del monto fijo (para 'fixed'). En el cobro se usa la del servicio.
  @Column({ name: 'currency', type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  @Column({ name: 'is_active', type: 'tinyint', default: 1 })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
