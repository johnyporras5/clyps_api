import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('session')
export class Session {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'client_id' })
  clientId: number;

  @Column({ name: 'session_datetime', nullable: true })
  sessionDatetime: Date;

  @Column({ name: 'session_status', nullable: true })
  sessionStatus: number;

  @Column({
    name: 'total_cost',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value)
    }
  })
  totalCost: number;

  @Column({ name: 'total_time', nullable: true })
  totalTime: number;

  @Column({ name: 'ia_response', type: 'json', nullable: true })
  iaResponse: any;

  @Column({ name: 'start_datetime', nullable: true })
  startDatetime: Date;

  @Column({ name: 'status', nullable: true })
  status: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'description_ia', type: 'text', nullable: true })
  descriptionIA: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string;

  @Column({ name: 'extra_services', type: 'json', nullable: true })
  extraServices?: Array<{
    sessionDetailId: number;  // ID del SessionDetail creado
    serviceId: number;         // 2 (FK)
    serviceName: string;       // "Barba" 
    providerId: number;        // 1 (puede ser diferente al main)
    providerName: string;      // "Daniel Durán"
    date: string;              // "2026-02-15"
    time: string;              // "9:30 AM"
    durationMinutes: number;   // 15
    priceOption: "default" | "custom" | "free";
    price: number;             // 1500 (calculado según priceOption)
    customPrice?: number;      // Solo si priceOption === "custom"
    createdAt: string          // "2026-02-15T08:45:00.000Z"
  }>;
}
