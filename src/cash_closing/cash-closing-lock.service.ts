import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashClosing } from './entities/cash-closing.entity';
import { businessDateOf } from '../common/utils/business-time.util';

@Injectable()
export class CashClosingLockService {
  constructor(
    @InjectRepository(CashClosing)
    private readonly closingRepository: Repository<CashClosing>,
  ) {}

  async assertDayOpen(companyId: number, date: string): Promise<void> {
    const closing = await this.closingRepository.findOne({
      where: { companyId, date, status: 'closed' },
      select: ['id', 'date'],
    });
    if (!closing) return;
    throw new ConflictException({
      code: 'CASH_DAY_CLOSED',
      message: `La caja del ${date} ya está cerrada. Revierte el cierre para poder modificar ese día.`,
      date,
      closingId: closing.id,
    });
  }

  async assertInstantOpen(
    companyId: number,
    instant: Date | string | null | undefined,
  ): Promise<void> {
    if (!instant) return;
    await this.assertDayOpen(companyId, businessDateOf(instant));
  }
}
