import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyCategoryService } from './company_category.service';
import { CompanyCategoryController } from './company_category.controller';
import { CompanyCategory } from './entities/company_category.entity';
import { Company } from '../company/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyCategory, Company])],
  providers: [CompanyCategoryService],
  controllers: [CompanyCategoryController],
  exports: [CompanyCategoryService],
})
export class CompanyCategoryModule {}