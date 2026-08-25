import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashCategoryService } from './cash-category.service';
import { CashCategoryController } from './cash-category.controller';
import { CashCategory } from './entities/cash-category.entity';
import { CashTransaction } from '../cash_transaction/entities/cash-transaction.entity';
import { Company } from '../company/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CashCategory, CashTransaction, Company])],
  providers: [CashCategoryService],
  controllers: [CashCategoryController],
  exports: [CashCategoryService],
})
export class CashCategoryModule {}
