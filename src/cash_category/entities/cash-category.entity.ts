import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import type { CashCategoryKind } from '../cash-category.enums';

/**
 * CLYP-353: categoría con la que el dueño clasifica sus movimientos de caja,
 * por tenant (company). Es lo que permite que los reportes agrupen ("cuánto
 * gasté en limpieza este año").
 *
 * Cada company arranca con un set de categorías comunes (ver
 * `cash-category.seed.ts`), pero son suyas: puede renombrarlas, desactivarlas o
 * agregar las propias.
 *
 * Una categoría con movimientos NO se puede borrar: la FK de `cash_transaction`
 * es RESTRICT. Para sacarla del flujo sin perder el histórico está `is_active`.
 */
@Entity('cash_category')
// El nombre no se repite dentro de una misma company.
@Index('UQ_cash_category_company_name', ['companyId', 'name'], { unique: true })
export class CashCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'name', type: 'varchar', length: 145 })
  name: string;

  // 'income' | 'expense' | 'both'. Filtra qué categorías se ofrecen al
  // registrar un movimiento de cada tipo.
  @Column({ name: 'kind', type: 'varchar', length: 10 })
  kind: CashCategoryKind;

  // Desactivar la saca del selector de movimientos nuevos sin tocar los viejos:
  // es la alternativa al borrado cuando la categoría ya tiene histórico.
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
