import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { Session } from 'src/session/entities/session.entity';
import { SessionDetail } from 'src/session_detail/entities/session_detail.entity';
import { CompanyWorker } from 'src/company_worker/entities/company_worker.entity';
import { Offer } from 'src/Offer/entities/offer.entity';
import {
  ATTENDED_SESSION_STATUSES,
  estimateVisitFrequencyDays,
  upsertVisitFrequency,
} from './visit-frequency.util';

@Injectable()
export class ClientVisitFrequencyService {
  private readonly logger = new Logger(ClientVisitFrequencyService.name);

  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(SessionDetail)
    private readonly sessionDetailRepository: Repository<SessionDetail>,
  ) {}

  async recalculateForSession(sessionId: number): Promise<void> {
    try {
      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
        select: { id: true, clientId: true },
      });
      if (!session?.clientId) return;

      const companyIds = await this.resolveSessionCompanyIds(sessionId);
      for (const companyId of companyIds) {
        await this.recalculate(session.clientId, companyId);
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo recalcular la frecuencia de visitas de la cita ${sessionId}: ${(error as Error).message}`,
      );
    }
  }

  async recalculate(
    clientId: number,
    companyId: number,
  ): Promise<number | null> {
    const rows = await this.sessionRepository
      .createQueryBuilder('session')
      .innerJoin(SessionDetail, 'detail', 'detail.session_id = session.id')
      .leftJoin(CompanyWorker, 'cw', 'cw.id = detail.company_worker_id')
      .leftJoin(Offer, 'offer', 'offer.id = detail.offer_id')
      .select('session.id', 'id')
      .addSelect('session.session_datetime', 'visitedAt')
      .where('session.client_id = :clientId', { clientId })
      .andWhere('session.session_status IN (:...statuses)', {
        statuses: ATTENDED_SESSION_STATUSES,
      })
      .andWhere('session.session_datetime IS NOT NULL')
      .andWhere('COALESCE(cw.company_id, offer.company_id) = :companyId', {
        companyId,
      })
      .getRawMany<{ id: number; visitedAt: Date | string }>();

    const visitsBySession = new Map<number, Date | string>();
    for (const row of rows) visitsBySession.set(Number(row.id), row.visitedAt);

    const days = estimateVisitFrequencyDays([...visitsBySession.values()]);
    if (days === null) return null;

    const client = await this.clientRepository.findOne({
      where: { id: clientId },
      select: { id: true, companyVisitFrequencies: true },
    });
    if (!client) return null;

    await this.clientRepository.update(clientId, {
      companyVisitFrequencies: upsertVisitFrequency(
        client.companyVisitFrequencies,
        companyId,
        days,
        'auto',
      ),
    });
    return days;
  }

  private async resolveSessionCompanyIds(sessionId: number): Promise<number[]> {
    const rows = await this.sessionDetailRepository
      .createQueryBuilder('detail')
      .leftJoin(CompanyWorker, 'cw', 'cw.id = detail.company_worker_id')
      .leftJoin(Offer, 'offer', 'offer.id = detail.offer_id')
      .select('COALESCE(cw.company_id, offer.company_id)', 'companyId')
      .where('detail.session_id = :sessionId', { sessionId })
      .getRawMany<{ companyId: number | null }>();

    return [
      ...new Set(
        rows
          .map((r) => Number(r.companyId))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];
  }
}
