import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { Company } from './entities/company.entity';
import { CommonModule } from 'src/common/common.module';
import { User } from 'src/user/entities/user.entity';
import { CompanyWorker } from 'src/company_worker/entities/company_worker.entity';
import { Client } from 'src/client/entities/client.entity';
import { CalendarCompany } from 'src/calendar_company/entities/calendar-company.entity';
import { Service } from 'src/service/entities/service.entity';
import { ServiceCategory } from 'src/service_category/entities/service_category.entity';
import { CompanyCategory } from 'src/company_category/entities/company_category.entity';
import { CompanyFeedback } from 'src/company_feedback/entities/company_feedback.entity';
import { WorkerFeedback } from 'src/worker_feedback/entities/worker_feedback.entity';
import { ServiceFeedback } from 'src/service_feedback/entities/service_feedback.entity';
import { Session } from 'src/session/entities/session.entity';
import { SessionDetail } from 'src/session_detail/entities/session_detail.entity';
import { SiteCategory } from 'src/site_category/entities/site_category.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      User,
      CompanyWorker,
      Client,
      CalendarCompany,
      Service,
      ServiceCategory,
      CompanyCategory,
      CompanyFeedback,
      WorkerFeedback,
      ServiceFeedback,
      Session,
      SessionDetail,
      SiteCategory,
    ]),
    CommonModule,
    RealtimeModule,
    OnboardingModule,
  ],
  providers: [CompanyService],
  controllers: [CompanyController],
  exports: [CompanyService],
})
export class CompanyModule {}
