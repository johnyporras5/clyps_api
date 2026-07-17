import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollConfig } from './entities/payroll-config.entity';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { PeriodDetail } from './entities/period-detail.entity';
import { PayrollConcept } from './entities/payroll-concept.entity';
import { Payout } from './entities/payout.entity';

// PAY-1: solo entidades por ahora (service/controller llegan en PAY-2+).
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayrollConfig,
      PayrollPeriod,
      PeriodDetail,
      PayrollConcept,
      Payout,
    ]),
  ],
})
export class PayrollModule {}
