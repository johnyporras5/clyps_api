import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import type {
  OnboardingGlobalStatus,
  OnboardingSteps,
} from '../types/onboarding.types';

/**
 * ONB-1: progreso de onboarding de una company (tenant). Un registro por company.
 *
 * `updated_at` se toca en CADA cambio de paso (y solo si algo cambió): ONB-4 lo
 * usa para medir estancamiento, así que un recálculo que no cambia nada NO debe
 * moverlo.
 */
@Entity('onboarding_state')
@Index('IDX_onboarding_status', ['globalStatus'])
@Index('IDX_onboarding_status_updated', ['globalStatus', 'updatedAt'])
export class OnboardingState {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', unique: true })
  companyId: number;

  @Column({
    name: 'global_status',
    type: 'varchar',
    length: 16,
    default: 'in_progress',
  })
  globalStatus: OnboardingGlobalStatus;

  /** { "create_profile": { status, updatedAt, missing? }, ... } */
  @Column({ name: 'steps', type: 'json' })
  steps: OnboardingSteps;

  /** Cuándo cobró su primera cita (el "ajá"); null hasta que ocurre. */
  @Column({ name: 'first_charge_at', type: 'datetime', nullable: true })
  firstChargeAt: Date | null;

  @Column({
    name: 'started_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  startedAt: Date;

  /** Cuándo `global_status` pasó a completed. */
  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;
}
