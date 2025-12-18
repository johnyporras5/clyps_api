import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkerFeedbackService } from './worker_feedback.service';
import { WorkerFeedbackController } from './worker_feedback.controller';
import { WorkerFeedback } from './entities/worker_feedback.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkerFeedback])],
  providers: [WorkerFeedbackService],
  controllers: [WorkerFeedbackController],
  exports: [WorkerFeedbackService],
})
export class WorkerFeedbackModule {}
