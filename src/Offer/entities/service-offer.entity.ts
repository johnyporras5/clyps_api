import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Offer } from './offer.entity';
import { Service } from '../../service/entities/service.entity';

@Entity('service_offer')
export class ServiceOffer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'service_id' })
  serviceId: number;

  @Column({ name: 'offer_id' })
  offerId: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @ManyToOne(() => Offer, (offer) => offer.serviceOffers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'offer_id' })
  offer: Offer;
}
