import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Correo que pidió no recibir promociones. Siempre en minúsculas. */
@Entity('email_opt_out')
export class EmailOptOut {
  @PrimaryColumn({ name: 'email', type: 'varchar', length: 245 })
  email: string;

  @CreateDateColumn({ name: 'opted_out_at', type: 'datetime' })
  optedOutAt: Date;
}
