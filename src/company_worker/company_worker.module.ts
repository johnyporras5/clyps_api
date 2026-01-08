// company_worker.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyWorkerService } from './company_worker.service';
import { CompanyWorkerController } from './company_worker.controller';
import { CompanyWorker } from './entities/company_worker.entity';
import { Company } from '../company/entities/company.entity';
import { Worker } from '../worker/entities/worker.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompanyWorker, Company, Worker, User]),
  ],
  controllers: [CompanyWorkerController],
  providers: [CompanyWorkerService],
  exports: [CompanyWorkerService],
})
export class CompanyWorkerModule {}