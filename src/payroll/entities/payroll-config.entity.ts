import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { PayrollFrequency } from '../payroll.enums';

/**
 * Configuración de nómina de una compañía (una fila por company). Hoy solo la
 * frecuencia de pago; pensada para crecer (tasas por defecto, booth rent, etc.).
 */
@Entity('payroll_config')
export class PayrollConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', unique: true })
  companyId: number;

  @Column({
    name: 'frequency',
    type: 'varchar',
    length: 20,
    default: 'quincenal',
  })
  frequency: PayrollFrequency;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
