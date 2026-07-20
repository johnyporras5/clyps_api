import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollConfig } from './entities/payroll-config.entity';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { PeriodDetail } from './entities/period-detail.entity';
import { PayrollConcept } from './entities/payroll-concept.entity';
import { Payout } from './entities/payout.entity';
import { Company } from '../company/entities/company.entity';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollEarningsService } from './payroll-earnings.service';
import { PayrollController } from './payroll.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      PayrollConfig,
      PayrollPeriod,
      PeriodDetail,
      PayrollConcept,
      Payout,
      Company,
    ]),
  ],
  controllers: [PayrollController],
  providers: [PayrollPeriodService, PayrollEarningsService],
  exports: [PayrollPeriodService, PayrollEarningsService],
})
export class PayrollModule {}
