import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyFeedbackService } from './company_feedback.service';
import { CompanyFeedbackController } from './company_feedback.controller';
import { CompanyFeedback } from './entities/company_feedback.entity';
import { Company } from '../company/entities/company.entity';
import { Client } from '../client/entities/client.entity';
import { Session } from '../session/entities/session.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { Service } from '../service/entities/service.entity';
import { Worker } from '../worker/entities/worker.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { CommonModule } from '../common/common.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyFeedback,
      Company,
      Client,
      Session,
      SessionDetail,
      Service,
      Worker,
      CompanyWorker,
    ]),
    CommonModule,
    RealtimeModule,
    NotificationModule,
  ],
  providers: [CompanyFeedbackService],
  controllers: [CompanyFeedbackController],
  exports: [CompanyFeedbackService],
})
export class CompanyFeedbackModule {}
