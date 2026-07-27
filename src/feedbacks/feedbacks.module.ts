import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeedbacksService } from './feedbacks.service';
import { FeedbacksController } from './feedbacks.controller';
import { Session } from '../session/entities/session.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { CompanyFeedback } from '../company_feedback/entities/company_feedback.entity';
import { WorkerFeedback } from '../worker_feedback/entities/worker_feedback.entity';
import { Client } from '../client/entities/client.entity';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Session,
      SessionDetail,
      CompanyFeedback,
      WorkerFeedback,
      Client,
    ]),
    CommonModule,
  ],
  controllers: [FeedbacksController],
  providers: [FeedbacksService],
  exports: [FeedbacksService],
})
export class FeedbacksModule {}
