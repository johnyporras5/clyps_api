import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../company/entities/company.entity';
import { CalendarCompany } from '../calendar_company/entities/calendar-company.entity';
import { CompanyFeedback } from '../company_feedback/entities/company_feedback.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Service } from '../service/entities/service.entity';
import { Session } from '../session/entities/session.entity';
import { User } from '../user/entities/user.entity';
import { Client } from '../client/entities/client.entity';
import { ServiceModule } from '../service/service.module';
import { OfferModule } from '../Offer/offer.module';
import { PortfolioPicturesModule } from '../portfolio_pictures/portfolio_pictures.module';
import { SessionModule } from '../session/session.module';
import { EmailModule } from '../email/email.module';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CalendarCompany,
      CompanyFeedback,
      CompanyWorker,
      Service,
      Session,
      User,
      Client,
    ]),
    ServiceModule,
    OfferModule,
    PortfolioPicturesModule,
    SessionModule,
    EmailModule,
  ],
  controllers: [PublicBookingController],
  providers: [PublicBookingService],
})
export class PublicBookingModule {}
