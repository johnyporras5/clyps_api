import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyWorkerService } from './company_worker.service';
import { CompanyWorkerController } from './company_worker.controller';
import { CompanyWorker } from './entities/company_worker.entity';
import { Company } from '../company/entities/company.entity';
import { Worker } from '../worker/entities/worker.entity';
import { User } from '../user/entities/user.entity';
import { WorkerFeedback } from 'src/worker_feedback/entities/worker_feedback.entity';
import { Session } from 'src/session/entities/session.entity';
import { SessionDetail } from 'src/session_detail/entities/session_detail.entity';
import { CommonModule } from 'src/common/common.module';
import { OnboardingModule } from 'src/onboarding/onboarding.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompanyWorker,
      Company,
      Worker,
      User,
      WorkerFeedback,
      Session,
      SessionDetail,
    ]),
    CommonModule,
    OnboardingModule,
  ],
  controllers: [CompanyWorkerController],
  providers: [CompanyWorkerService],
  exports: [CompanyWorkerService],
})
export class CompanyWorkerModule {}
