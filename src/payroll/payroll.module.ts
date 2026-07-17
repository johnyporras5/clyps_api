import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollConfig } from './entities/payroll-config.entity';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { PeriodDetail } from './entities/period-detail.entity';
import { PayrollConcept } from './entities/payroll-concept.entity';
import { Payout } from './entities/payout.entity';
import { Company } from '../company/entities/company.entity';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollController } from './payroll.controller';

@Module({
  imports: [
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
  providers: [PayrollPeriodService],
  exports: [PayrollPeriodService],
})
export class PayrollModule {}
