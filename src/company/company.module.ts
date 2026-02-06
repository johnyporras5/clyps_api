import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { Company } from './entities/company.entity';
import { CommonModule } from 'src/common/common.module';
import { User } from 'src/user/entities/user.entity';
import { CompanyWorker } from 'src/company_worker/entities/company_worker.entity';
import { Client } from 'src/client/entities/client.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Company,User,CompanyWorker,Client]), CommonModule],
  providers: [CompanyService],
  controllers: [CompanyController],
  exports: [CompanyService],
})
export class CompanyModule {}
