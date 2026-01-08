import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyWorkerService } from './company_worker.service';
import { CompanyWorkerController } from './company_worker.controller';
import { CompanyWorker } from './entities/company_worker.entity';
import { Company } from 'src/company/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyWorker,Company])],
  providers: [CompanyWorkerService],
  controllers: [CompanyWorkerController],
  exports: [CompanyWorkerService],
})
export class CompanyWorkerModule {}
