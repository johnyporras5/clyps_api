import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';

/**
 * CLYP-320: bitácora de ajustes de stock (entrada de mercancía / corrección).
 * Registra quién y cuándo, con el stock resultante como snapshot.
 */
@Entity('product_stock_movement')
@Index('IDX_product_stock_movement_product', ['productId'])
export class ProductStockMovement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'product_id' })
  productId: number;

  // Cambio aplicado: + entrada de mercancía, − corrección/salida manual.
  @Column({ name: 'delta', type: 'int' })
  delta: number;

  // Stock tras aplicar el delta (snapshot para auditoría).
  @Column({ name: 'resulting_stock', type: 'int' })
  resultingStock: number;

  @Column({ name: 'reason', type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  // Usuario que hizo el ajuste.
  @Column({ name: 'created_by_user_id', type: 'int', nullable: true })
  createdByUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
