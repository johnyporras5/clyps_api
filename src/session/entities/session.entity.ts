import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('session')
export class Session {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Código público/visual de la cita (ej. `CIT-048291`). Es SOLO para mostrar
   * al usuario en vez del `id` interno; los enlaces/rutas siguen usando `id`.
   * Se genera en el SessionSubscriber (beforeInsert) con reintento por
   * unicidad. Opaco y no secuencial: no filtra volumen ni orden de creación.
   */
  @Column({ name: 'public_code', type: 'varchar', length: 16, nullable: true })
  publicCode: string | null;

  @Column({ name: 'client_id' })
  clientId: number;

  @Column({ name: 'session_datetime', nullable: true })
  sessionDatetime: Date;

  @Column({ name: 'session_status', nullable: true })
  sessionStatus: number;

  /**
   * Cuando es true, el admin tomó el control del estado de la cita:
   * los trabajadores no pueden cambiar sus detalles y el auto-sync
   * (recálculo desde los detalles) queda desactivado.
   */
  @Column({ name: 'status_locked', type: 'tinyint', default: 0 })
  statusLocked: boolean;

  // Motivo de cancelación de la cita (se llena cuando el admin o el cliente
  // cancela la cita completa)
  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason?: string | null;

  // Quién canceló la cita: 'adm' (administrador), 'cli' (cliente),
  // 'wrk' (trabajador) o 'system' (auto-cancelación por cita vencida).
  @Column({ name: 'cancelled_by', type: 'varchar', length: 20, nullable: true })
  cancelledBy?: string | null;

  @Column({
    name: 'total_cost',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number) => value,
      from: (value: string | null) =>
        value == null ? null : parseFloat(value),
    },
  })
  totalCost: number;

  @Column({ name: 'total_time', nullable: true })
  totalTime: number;

  @Column({ name: 'ia_response', type: 'json', nullable: true })
  iaResponse: any;

  @Column({ name: 'start_datetime', nullable: true })
  startDatetime: Date;

  // Hora AGENDADA original de la cita. Se fija al crear y no se mueve con
  // Comenzar/Terminar ni con el arrastre; start_datetime es la posición viva.
  @Column({ name: 'original_start_datetime', type: 'datetime', nullable: true })
  originalStartDatetime: Date | null;

  @Column({ name: 'status', nullable: true })
  status: number;

  /**
   * Confirmación de asistencia del cliente (CLYP-264 / popup desde recordatorio).
   * 0 = sin responder, 1 = confirma asistencia, 2 = no asistirá.
   */
  @Column({ name: 'attendance_status', type: 'tinyint', default: 0 })
  attendanceStatus: number;

  @Column({ name: 'attendance_responded_at', type: 'datetime', nullable: true })
  attendanceRespondedAt: Date | null;

  // El cliente declaró que no calificará esta cita (skip). Estado terminal.
  @Column({ name: 'feedback_skipped_at', type: 'datetime', nullable: true })
  feedbackSkippedAt: Date | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'description_ia', type: 'text', nullable: true })
  descriptionIA: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'extra_services', type: 'json', nullable: true })
  extraServices?: Array<{
    sessionDetailId: number; // ID del SessionDetail creado
    serviceId: number; // 2 (FK)
    serviceName: string; // "Barba"
    providerId: number; // 1 (puede ser diferente al main)
    providerName: string; // "Daniel Durán"
    date: string; // "2026-02-15"
    time: string; // "9:30 AM"
    durationMinutes: number; // 15
    priceOption: 'default' | 'custom' | 'free';
    price: number; // 1500 (calculado según priceOption)
    customPrice?: number; // Solo si priceOption === "custom"
    description?: string; // Descripción del servicio extra
    descriptionIA?: string; // Descripción generada por IA
    createdAt: string; // "2026-02-15T08:45:00.000Z"
  }>;
}
