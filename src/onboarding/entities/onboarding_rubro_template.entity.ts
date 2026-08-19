import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { RubroTemplate } from '../types/rubro-template.types';

/**
 * ONB-2: plantilla maestra de un rubro. Es de la plataforma, NO editable por los
 * tenants: se mantiene internamente (migraciones / panel interno) para irla
 * mejorando con feedback del gremio.
 *
 * `rubro_key` coincide con el `slug` del catálogo global `site_category`, que es
 * lo que el dueño marca al registrarse y lo que queda en `company_category.name`.
 */
@Entity('onboarding_rubro_template')
@Index('IDX_rubro_template_active', ['isActive', 'sortOrder'])
export class OnboardingRubroTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  /** Ej: 'barberia', 'salon_belleza'. Mismo valor que `site_category.slug`. */
  @Column({ name: 'rubro_key', type: 'varchar', length: 64, unique: true })
  rubroKey: string;

  /** Ej: 'Barbería'. */
  @Column({ name: 'rubro_name', type: 'varchar', length: 128 })
  rubroName: string;

  @Column({ name: 'template', type: 'json' })
  template: RubroTemplate;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
