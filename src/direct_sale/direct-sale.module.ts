import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DirectSale } from './entities/direct-sale.entity';
import { Company } from '../company/entities/company.entity';
import { Client } from '../client/entities/client.entity';
import { DirectSaleService } from './direct-sale.service';
import { DirectSaleController } from './direct-sale.controller';
import { ProductModule } from '../product/product.module';
import { PayrollModule } from '../payroll/payroll.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DirectSale, Company, Client]),
    ProductModule,
    PayrollModule,
  ],
  controllers: [DirectSaleController],
  providers: [DirectSaleService],
})
export class DirectSaleModule {}
