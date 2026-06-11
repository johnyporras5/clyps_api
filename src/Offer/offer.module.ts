import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OfferService } from './offer.service';
import { OfferController } from './offer.controller';
import { Offer } from './entities/offer.entity';
import { ServiceOffer } from './entities/service-offer.entity';
import { Company } from '../company/entities/company.entity';
import { Service } from '../service/entities/service.entity';
import { CommonModule } from '../common/common.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Offer, ServiceOffer, Company, Service]),
    CommonModule,
    RealtimeModule,
  ],
  providers: [OfferService],
  controllers: [OfferController],
  exports: [OfferService, TypeOrmModule],
})
export class OfferModule {}
