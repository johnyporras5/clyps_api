import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCategoryService } from './product_category.service';
import { ProductCategoryController } from './product_category.controller';
import { ProductCategory } from './entities/product_category.entity';
import { Company } from '../company/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProductCategory, Company])],
  providers: [ProductCategoryService],
  controllers: [ProductCategoryController],
  exports: [ProductCategoryService],
})
export class ProductCategoryModule {}
