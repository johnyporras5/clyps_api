import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { Product } from './entities/product.entity';
import { ProductStockMovement } from './entities/product_stock_movement.entity';
import { ProductCategory } from '../product_category/entities/product_category.entity';
import { Company } from '../company/entities/company.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductStockMovement,
      ProductCategory,
      Company,
    ]),
  ],
  providers: [ProductService],
  controllers: [ProductController],
  exports: [ProductService],
})
export class ProductModule {}
