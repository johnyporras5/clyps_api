import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyFeedbackService } from './company_feedback.service';
import { CompanyFeedbackController } from './company_feedback.controller';
import { CompanyFeedback } from './entities/company_feedback.entity';
import { Company } from '../company/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyFeedback, Company])],
  providers: [CompanyFeedbackService],
  controllers: [CompanyFeedbackController],
  exports: [CompanyFeedbackService],
})
export class CompanyFeedbackModule {}
