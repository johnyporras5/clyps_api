import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { Service } from '../service/entities/service.entity';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SessionDetail, Service, Company, CompanyWorker])],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
