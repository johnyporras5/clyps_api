import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkerFeedbackService } from './worker_feedback.service';
import { WorkerFeedbackController } from './worker_feedback.controller';
import { WorkerFeedback } from './entities/worker_feedback.entity';
import { Worker } from '../worker/entities/worker.entity';
import { Company } from 'src/company/entities/company.entity';
import { CompanyWorker } from 'src/company_worker/entities/company_worker.entity';
import { Client } from 'src/client/entities/client.entity';
import { Session } from 'src/session/entities/session.entity';
import { CommonModule } from 'src/common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkerFeedback,
      Worker,
      Company,
      CompanyWorker,
      Client,
      Session,
    ]),
    CommonModule,
  ],
  providers: [WorkerFeedbackService],
  controllers: [WorkerFeedbackController],
  exports: [WorkerFeedbackService],
})
export class WorkerFeedbackModule {}
