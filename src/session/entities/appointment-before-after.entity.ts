import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Registro "Antes y después" asociado 1:1 a una sesión (cita).
 *
 * Cada slot (before / after) guarda el nombre del archivo en el bucket/CDN
 * (mismo almacenamiento que portfolio-pictures), junto con la marca de tiempo
 * de subida y una instantánea de quién lo subió (id + nombre), inferida del
 * token en el momento de la subida.
 */
@Entity('appointment_before_after')
export class AppointmentBeforeAfter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'session_id', unique: true })
  sessionId: number;

  // ----- Slot "before" -----
  @Column({ name: 'before_picture', length: 255, nullable: true })
  beforePicture: string | null;

  @Column({ name: 'before_uploaded_at', type: 'datetime', nullable: true })
  beforeUploadedAt: Date | null;

  @Column({ name: 'before_uploaded_by_id', nullable: true })
  beforeUploadedById: number | null;

  @Column({
    name: 'before_uploaded_by_name',
    length: 145,
    nullable: true,
  })
  beforeUploadedByName: string | null;

  // ----- Slot "after" -----
  @Column({ name: 'after_picture', length: 255, nullable: true })
  afterPicture: string | null;

  @Column({ name: 'after_uploaded_at', type: 'datetime', nullable: true })
  afterUploadedAt: Date | null;

  @Column({ name: 'after_uploaded_by_id', nullable: true })
  afterUploadedById: number | null;

  @Column({ name: 'after_uploaded_by_name', length: 145, nullable: true })
  afterUploadedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
