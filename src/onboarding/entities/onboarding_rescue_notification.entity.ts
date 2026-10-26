import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import type { OnboardingStepKey } from '../types/onboarding.types';
import type { RescueLevel } from '../types/rescue.types';

/**
 * ONB-4: registro auditable de un aviso de rescate ya enviado.
 *
 * Una fila por (company, paso, nivel, canal). Mientras la fila exista no se
 * vuelve a avisar por esa combinación; el escalamiento crea una fila distinta y
 * por eso sí notifica de nuevo. El canal va en la llave porque un mismo nivel
 * avisa a dos personas: al consultor (digest) y al dueño (correo).
 */
@Entity('onboarding_rescue_notification')
@Index(
  'UQ_rescue_company_step_level_channel',
  ['companyId', 'step', 'level', 'channel'],
  { unique: true },
)
export class OnboardingRescueNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  /** Paso en el que estaba trabado cuando se avisó. */
  @Column({ name: 'step', type: 'varchar', length: 32 })
  step: OnboardingStepKey;

  @Column({ name: 'level', type: 'varchar', length: 16 })
  level: RescueLevel;

  /** Por dónde salió: `owner_notification` | `owner_email` | `consultant_digest`. */
  @Column({ name: 'channel', type: 'varchar', length: 24 })
  channel: string;

  /** Días sin avanzar al momento del aviso (para auditar después). */
  @Column({ name: 'days_stalled', type: 'int', default: 0 })
  daysStalled: number;

  @Column({
    name: 'sent_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  sentAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;
}
