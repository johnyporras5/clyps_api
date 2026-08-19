import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { SessionProductService } from './session_product.service';
import { ProductController } from './product.controller';
import { Product } from './entities/product.entity';
import { ProductStockMovement } from './entities/product_stock_movement.entity';
import { SessionProduct } from './entities/session_product.entity';
import { ProductCategory } from '../product_category/entities/product_category.entity';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductStockMovement,
      SessionProduct,
      ProductCategory,
      Company,
      CompanyWorker,
    ]),
  ],
  providers: [ProductService, SessionProductService],
  controllers: [ProductController],
  exports: [ProductService, SessionProductService],
})
export class ProductModule {}
