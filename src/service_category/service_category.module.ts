import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceCategoryService } from './service_category.service';
import { ServiceCategoryController } from './service_category.controller';
import { ServiceCategory } from './entities/service_category.entity';
import { Company } from '../company/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceCategory, Company])],
  providers: [ServiceCategoryService],
  controllers: [ServiceCategoryController],
  exports: [ServiceCategoryService],
})
export class ServiceCategoryModule {}