import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceFeedbackService } from './service_feedback.service';
import { ServiceFeedbackController } from './service_feedback.controller';
import { ServiceFeedback } from './entities/service_feedback.entity';
import { Service } from '../service/entities/service.entity';
import { Company } from '../company/entities/company.entity';
import { Client } from '../client/entities/client.entity';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceFeedback, Service, Company, Client]),
    CommonModule,
  ],
  providers: [ServiceFeedbackService],
  controllers: [ServiceFeedbackController],
  exports: [ServiceFeedbackService],
})
export class ServiceFeedbackModule {}
