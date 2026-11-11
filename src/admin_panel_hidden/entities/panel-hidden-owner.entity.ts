import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Dueño oculto de la lista del panel. Ver la migración 083. */
@Entity('panel_hidden_owner')
export class PanelHiddenOwner {
  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;

  /** Administrador que lo ocultó (sale del token). */
  @Column({ name: 'hidden_by', type: 'int', nullable: true })
  hiddenBy: number | null;

  @CreateDateColumn({ name: 'hidden_at', type: 'datetime' })
  hiddenAt: Date;
}
