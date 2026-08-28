import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashTransaction } from './entities/cash-transaction.entity';
import { CashCategory } from '../cash_category/entities/cash-category.entity';
import { Company } from '../company/entities/company.entity';
import { ReportsModule } from '../reports/reports.module';
import { CashSupplierService } from './cash-supplier.service';
import { CashSupplierController } from './cash-supplier.controller';
import { CashTransactionService } from './cash-transaction.service';
import { CashTransactionController } from './cash-transaction.controller';
import { CashProfitabilityService } from './cash-profitability.service';
import { CashProfitabilityController } from './cash-profitability.controller';

/**
 * Movimientos de caja: el CRUD (CLYP-354), el autocompletado de proveedores
 * (CLYP-355) y el reporte de rentabilidad (CLYP-357), que cruza la caja con los
 * cobros del módulo de reportes.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CashTransaction, CashCategory, Company]),
    ReportsModule,
  ],
  providers: [
    CashTransactionService,
    CashSupplierService,
    CashProfitabilityService,
  ],
  controllers: [
    CashTransactionController,
    CashSupplierController,
    CashProfitabilityController,
  ],
  exports: [CashTransactionService, CashSupplierService],
})
export class CashTransactionModule {}
