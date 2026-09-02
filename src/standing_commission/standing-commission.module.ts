import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StandingCommission } from './entities/standing-commission.entity';
import { CommissionRole } from './entities/commission-role.entity';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Service } from '../service/entities/service.entity';
import { StandingCommissionService } from './standing-commission.service';
import { StandingCommissionController } from './standing-commission.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StandingCommission,
      CommissionRole,
      Company,
      CompanyWorker,
      Service,
    ]),
  ],
  controllers: [StandingCommissionController],
  providers: [StandingCommissionService],
  exports: [StandingCommissionService],
})
export class StandingCommissionModule {}
