import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Rol genérico de comisión de la compañía ("Lavado de cabello", "Recepción", …).
 * Se usa en `standing_commission` (fila por rol): el % se define aquí y la
 * persona se elige en cada cobro. El admin administra la lista.
 */
@Entity('commission_role')
@Index('IDX_commission_role_company', ['companyId'])
export class CommissionRole {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'name', type: 'varchar', length: 80 })
  name: string;

  @Column({ name: 'is_active', type: 'tinyint', default: 1 })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
