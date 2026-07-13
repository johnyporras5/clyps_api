import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkerService } from './worker.service';
import { WorkerController } from './worker.controller';
import { Worker } from './entities/worker.entity';
import { User } from 'src/user/entities/user.entity';
import { Company } from 'src/company/entities/company.entity';
import { CompanyWorker } from 'src/company_worker/entities/company_worker.entity';
import { CommonModule } from 'src/common/common.module';
import { WorkerFeedback } from 'src/worker_feedback/entities/worker_feedback.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { CalendarCompany } from '../calendar_company/entities/calendar-company.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Worker,
      User,
      Company,
      CompanyWorker,
      WorkerFeedback,
      CalendarCompany,
    ]),
    CommonModule,
    RealtimeModule,
  ],
  providers: [WorkerService],
  controllers: [WorkerController],
  exports: [WorkerService],
})
export class WorkerModule {}
