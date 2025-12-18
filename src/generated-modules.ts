import { Module } from '@nestjs/common';
import { CalendarModule } from './calendar/calendar.module';
import { ClientModule } from './client/client.module';
import { CompanyModule } from './company/company.module';
import { CompanyFeedbackModule } from './company_feedback/company_feedback.module';
import { CompanyWorkerModule } from './company_worker/company_worker.module';
import { PortfolioPicturesModule } from './portfolio_pictures/portfolio_pictures.module';
import { ServiceModule } from './service/service.module';
import { SessionModule } from './session/session.module';
import { SessionDetailModule } from './session_detail/session_detail.module';
import { UserModule } from './user/user.module';
import { WorkerModule } from './worker/worker.module';
import { WorkerFeedbackModule } from './worker_feedback/worker_feedback.module';

@Module({
  imports: [
    CalendarModule,
    ClientModule,
    CompanyModule,
    CompanyFeedbackModule,
    CompanyWorkerModule,
    PortfolioPicturesModule,
    ServiceModule,
    SessionModule,
    SessionDetailModule,
    UserModule,
    WorkerModule,
    WorkerFeedbackModule
  ],
})
export class GeneratedModules {}
