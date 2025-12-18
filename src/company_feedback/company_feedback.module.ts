import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyFeedbackService } from './company_feedback.service';
import { CompanyFeedbackController } from './company_feedback.controller';
import { CompanyFeedback } from './entities/company_feedback.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyFeedback])],
  providers: [CompanyFeedbackService],
  controllers: [CompanyFeedbackController],
  exports: [CompanyFeedbackService],
})
export class CompanyFeedbackModule {}
