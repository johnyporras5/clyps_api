import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** Por qué dejó de estar viva la sesión. */
export type ImpersonationEndReason =
  /** El operador pulsó "Salir" dentro de la app del salón. */
  | 'manual'
  /** El operador la cortó desde el panel (o cortó la de otro operador). */
  | 'revoked'
  /** Nadie la cerró: se le acabó el tiempo al token. */
  | 'expired';

/**
 * Bitácora de los accesos del administrador de la PLATAFORMA (`padm`) a un
 * salón ajeno, sin la contraseña del dueño (CLYP-IMP).
 *
 * Esta tabla NO es un adorno: el acceso se concede sin re-autenticar y con
 * permisos completos de escritura, así que es lo ÚNICO que contesta "quién
 * tocó los datos de este salón y cuándo". Si una fila no se escribe, el
 * acceso pasa a ser invisible — por eso la fila se crea ANTES de entregar el
 * ticket, no después.
 *
 * Dos secretos distintos viven aquí, y ninguno en texto plano:
 *
 *   `ticket_hash` — el vale de un solo uso que viaja en la URL de la pestaña
 *                   nueva. Vale segundos y se quema al canjearlo.
 *   `token_hash`  — el SHA-256 del JWT que se entregó a cambio. Guardarlo es
 *                   lo que permite REVOCAR la sesión sin tener el token
 *                   delante: se copia a `blacklisted_tokens`, que
 *                   `JwtStrategy` ya consulta en cada petición.
 *
 * El hash es el mismo que usa TokenBlacklistService (sha256 hex), a propósito:
 * si fueran distintos, la revocación insertaría una fila que nunca coincide y
 * el botón "Terminar" mentiría en silencio.
 */
@Entity('impersonation_session')
// Las dos consultas reales: "sesiones vivas" en el panel y "el historial de
// este salón". Sin el índice, ambas barren la tabla entera.
@Index('IDX_impersonation_active', ['endedAt', 'tokenExpiresAt'])
@Index('IDX_impersonation_company', ['companyId', 'createdAt'])
export class ImpersonationSession {
  @PrimaryGeneratedColumn()
  id: number;

  /** El `padm` que pulsó "Acceder". Nunca es null: sin actor no hay auditoría. */
  @Column({ name: 'actor_user_id' })
  actorUserId: number;

  /**
   * Copia del correo del operador EN EL MOMENTO del acceso. Se duplica a
   * propósito: si mañana esa cuenta se borra o cambia de correo, el registro
   * de hace seis meses tiene que seguir diciendo quién entró.
   */
  @Column({ name: 'actor_email', type: 'varchar', length: 245, nullable: true })
  actorEmail: string | null;

  /** El dueño (`adm`) en cuyo nombre se actúa. */
  @Column({ name: 'target_user_id' })
  targetUserId: number;

  /** El salón al que se entró. Se fija aquí, no se deduce del dueño. */
  @Column({ name: 'company_id' })
  companyId: number;

  /**
   * SHA-256 del ticket. ÚNICO: es lo que hace imposible que dos sesiones
   * compartan vale. Se pone a null al canjearlo — así el índice único no se
   * llena de hashes muertos (MySQL permite varios NULL en un índice único).
   */
  @Column({ name: 'ticket_hash', type: 'char', length: 64, nullable: true })
  ticketHash: string | null;

  @Column({ name: 'ticket_expires_at', type: 'datetime' })
  ticketExpiresAt: Date;

  /** Cuándo se canjeó. null = el vale sigue sin usar (o caducó sin usarse). */
  @Column({ name: 'ticket_used_at', type: 'datetime', nullable: true })
  ticketUsedAt: Date | null;

  /** SHA-256 del JWT entregado. null mientras el ticket no se haya canjeado. */
  @Column({ name: 'token_hash', type: 'char', length: 64, nullable: true })
  tokenHash: string | null;

  /** Cuándo caduca el JWT por sí solo, sin que nadie lo revoque. */
  @Column({ name: 'token_expires_at', type: 'datetime', nullable: true })
  tokenExpiresAt: Date | null;

  /** Momento en que el acceso pasó a ser real (canje del ticket). */
  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'ended_at', type: 'datetime', nullable: true })
  endedAt: Date | null;

  @Column({
    name: 'ended_reason',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  endedReason: ImpersonationEndReason | null;

  /** IP desde la que se PIDIÓ el acceso (el panel), no desde la que se canjeó. */
  @Column({ name: 'ip', type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
