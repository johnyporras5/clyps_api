import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollConfig } from './entities/payroll-config.entity';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { PeriodDetail } from './entities/period-detail.entity';
import { PayrollConcept } from './entities/payroll-concept.entity';
import { Payout } from './entities/payout.entity';
import { PeriodDetailCurrency } from './entities/period-detail-currency.entity';
import { Company } from '../company/entities/company.entity';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollEarningsService } from './payroll-earnings.service';
import { PayrollController } from './payroll.controller';
import { CommonModule } from '../common/common.module';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  imports: [
    CommonModule,
    OnboardingModule,
    TypeOrmModule.forFeature([
      PayrollConfig,
      PayrollPeriod,
      PeriodDetail,
      PayrollConcept,
      Payout,
      PeriodDetailCurrency,
      Company,
    ]),
  ],
  controllers: [PayrollController],
  providers: [PayrollPeriodService, PayrollEarningsService],
  exports: [PayrollPeriodService, PayrollEarningsService],
})
export class PayrollModule {}
