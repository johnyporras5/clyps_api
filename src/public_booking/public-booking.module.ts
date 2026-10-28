import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../company/entities/company.entity';
import { CalendarCompany } from '../calendar_company/entities/calendar-company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Service } from '../service/entities/service.entity';
import { Session } from '../session/entities/session.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { User } from '../user/entities/user.entity';
import { Client } from '../client/entities/client.entity';
import { Worker } from '../worker/entities/worker.entity';
import { ServiceModule } from '../service/service.module';
import { OfferModule } from '../Offer/offer.module';
import { PortfolioPicturesModule } from '../portfolio_pictures/portfolio_pictures.module';
import { SessionModule } from '../session/session.module';
import { EmailModule } from '../email/email.module';
import { CommonModule } from '../common/common.module';
import { PublicBookingController } from './public-booking.controller';
import { BookingLinksController } from './booking-links.controller';
import {
  BookingRequestsController,
  BookingSettingsController,
} from './booking-requests.controller';
import { PublicBookingService } from './public-booking.service';
import { BookingRequestsService } from './booking-requests.service';
import { CompanyBookingSettings } from './entities/company-booking-settings.entity';
import { PublicBookingRequest } from './entities/public-booking-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CalendarCompany,
      CompanyWorker,
      Service,
      Session,
      SessionDetail,
      User,
      Client,
      Worker,
      CompanyBookingSettings,
      PublicBookingRequest,
    ]),
    ServiceModule,
    OfferModule,
    PortfolioPicturesModule,
    SessionModule,
    EmailModule,
    CommonModule,
  ],
  controllers: [
    PublicBookingController,
    BookingLinksController,
    BookingSettingsController,
    BookingRequestsController,
  ],
  providers: [PublicBookingService, BookingRequestsService],
})
export class PublicBookingModule {}
