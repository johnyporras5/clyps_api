import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { ServiceOffer } from './service-offer.entity';

export enum OfferStatus {
  ACTIVE = 1,
  INACTIVE = 0,
}

@Entity('offer')
export class Offer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 500, nullable: true })
  logo: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'tinyint',
    default: OfferStatus.ACTIVE,
  })
  status: number;

  @Column({ type: 'date', name: 'start_date' })
  startDate: Date;

  @Column({ type: 'date', name: 'end_date' })
  endDate: Date;

  @Column({ name: 'company_id' })
  companyId: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => ServiceOffer, (serviceOffer) => serviceOffer.offer, { cascade: true })
  serviceOffers: ServiceOffer[];
}