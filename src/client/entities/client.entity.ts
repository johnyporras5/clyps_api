import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('client')
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'name', length: 145, nullable: true })
  name: string;

  @Column({ name: 'last_name', length: 145, nullable: true })
  lastName: string;

  @Column({ name: 'email', length: 145, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate: Date;

  @Column({ name: 'picture', length: 500, nullable: true })
  picture: string;

  @Column({ name: 'is_active', type: 'tinyint', default: 1 })
  isActive: number;

  @Column({ name: 'location', length: 245, nullable: true })
  location: string;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ type: 'json', nullable: true })
  companies: number[];

  // Categorías de interés del cliente (ids del catálogo global `site_category`).
  // Se setean en el registro y alimentan el filtro inicial de la búsqueda.
  @Column({ type: 'json', nullable: true })
  preferences: number[];

  // Alias del cliente por compañía. Cada admin/compañía guarda su propio
  // alias sin pisar el de otra: [{ companyId, alias }]
  @Column({ name: 'company_aliases', type: 'json', nullable: true })
  companyAliases: { companyId: number; alias: string }[];

  // Fecha de la primera cita del cliente por compañía. Se registra al crear
  // la primera sesión/cita del cliente con esa compañía: [{ companyId, firstAppointmentDate }]
  @Column({ name: 'company_first_appointments', type: 'json', nullable: true })
  companyFirstAppointments: { companyId: number; firstAppointmentDate: Date }[];

  @Column({ name: 'temporarily_deleted', type: 'boolean', default: false })
  temporarilyDeleted: boolean;

  @Column({ name: 'permanently_deleted', type: 'boolean', default: false })
  permanentlyDeleted: boolean;

  // Relación uno a uno con User
  @OneToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
