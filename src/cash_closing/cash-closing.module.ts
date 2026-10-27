import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashClosing } from './entities/cash-closing.entity';
import { Company } from '../company/entities/company.entity';
import { CashClosingService } from './cash-closing.service';
import { CashClosingLockService } from './cash-closing-lock.service';
import { CashClosingController } from './cash-closing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CashClosing, Company])],
  providers: [CashClosingService, CashClosingLockService],
  controllers: [CashClosingController],
  exports: [CashClosingLockService],
})
export class CashClosingModule {}
