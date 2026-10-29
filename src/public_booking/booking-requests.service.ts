import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Brackets, In, LessThan, Repository } from 'typeorm';
import { CompanyBookingSettings } from './entities/company-booking-settings.entity';
import { PublicBookingRequest } from './entities/public-booking-request.entity';
import { Session } from '../session/entities/session.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { Service } from '../service/entities/service.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Company } from '../company/entities/company.entity';
import { Worker } from '../worker/entities/worker.entity';
import { User } from '../user/entities/user.entity';
import { Client } from '../client/entities/client.entity';
import * as bcrypt from 'bcrypt';
import { generateSimplePassword } from '../auth/password.util';
import { SessionService } from '../session/session.service';
import { SessionRealtimeEmitter } from '../session/session-realtime.emitter';
import { SessionNotificationEmitter } from '../session/session-notification.emitter';
import { EmailService } from '../email/email.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import {
  DEFAULT_HOLD_HOURS,
  DEFAULT_LEAD_MINUTES,
  PENDING_STATUSES,
  type BookingRequestStatus,
} from './booking-modes.enums';
import { UpdateBookingSettingsDto } from './dto/booking-settings.dto';
import { QueryBookingRequestsDto } from './dto/booking-requests.dto';

export interface BookingSettingsView {
  mode: CompanyBookingSettings['mode'];
  leadMinutes: number;
  holdHours: number;
  workersCanApprove: boolean;
  deposit: {
    type: 'fixed' | 'percent';
    amount: number | null;
    percent: number | null;
    currency: string | null;
    instructions: string;
  } | null;
}

const CLOSED_TEXT: Record<'rejected' | 'expired', string> = {
  rejected: 'Reserva por enlace rechazada',
  expired: 'Reserva por enlace vencida sin confirmar',
};

@Injectable()
export class BookingRequestsService {
  private readonly logger = new Logger(BookingRequestsService.name);

  constructor(
    @InjectRepository(CompanyBookingSettings)
    private readonly settingsRepository: Repository<CompanyBookingSettings>,
    @InjectRepository(PublicBookingRequest)
    private readonly requestRepository: Repository<PublicBookingRequest>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(SessionDetail)
    private readonly sessionDetailRepository: Repository<SessionDetail>,
    @InjectRepository(Service)
    private readonly serviceRepository: Repository<Service>,
    @InjectRepository(CompanyWorker)
    private readonly companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Worker)
    private readonly workerRepository: Repository<Worker>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly sessionService: SessionService,
    private readonly realtimeEmitter: SessionRealtimeEmitter,
    private readonly notificationEmitter: SessionNotificationEmitter,
    private readonly emailService: EmailService,
  ) {}

  async getSettings(companyId: number): Promise<BookingSettingsView> {
    if (!companyId) {
      throw new ForbiddenException('No perteneces a ningún negocio.');
    }
    const row = await this.settingsRepository.findOne({ where: { companyId } });
    return toSettingsView(row, true);
  }

  async updateSettings(
    companyId: number,
    dto: UpdateBookingSettingsDto,
  ): Promise<BookingSettingsView> {
    if (!companyId) {
      throw new ForbiddenException('No perteneces a ningún negocio.');
    }
    const row =
      (await this.settingsRepository.findOne({ where: { companyId } })) ??
      this.settingsRepository.create({ companyId });

    row.mode = dto.mode;
    row.leadMinutes = dto.leadMinutes;
    row.holdHours = dto.holdHours;
    row.workersCanApprove = dto.workersCanApprove;

    if (dto.mode === 'deposit') {
      const deposit = dto.deposit;
      if (!deposit || !deposit.instructions) {
        throw new BadRequestException(
          'Escribe los datos de pago que verá el cliente.',
        );
      }
      if (deposit.type === 'fixed') {
        if (!(Number(deposit.amount) > 0) || !deposit.currency) {
          throw new BadRequestException(
            'Escribe el monto y la moneda del adelanto.',
          );
        }
      } else if (
        !(Number(deposit.percent) >= 1 && Number(deposit.percent) <= 100)
      ) {
        throw new BadRequestException(
          'El porcentaje del adelanto debe estar entre 1 y 100.',
        );
      }
      row.depositType = deposit.type;
      row.depositAmount =
        deposit.type === 'fixed' ? Number(deposit.amount).toFixed(2) : null;
      row.depositPercent =
        deposit.type === 'percent' ? Number(deposit.percent) : null;
      row.depositCurrency =
        deposit.type === 'fixed' ? (deposit.currency ?? null) : null;
      row.paymentInstructions = deposit.instructions;
    } else if (dto.deposit) {
      const deposit = dto.deposit;
      row.depositType = deposit.type;
      if (deposit.type === 'fixed') {
        if (Number(deposit.amount) > 0) {
          row.depositAmount = Number(deposit.amount).toFixed(2);
        }
        if (deposit.currency) row.depositCurrency = deposit.currency;
      } else if (deposit.percent) {
        row.depositPercent = Number(deposit.percent);
      }
      row.paymentInstructions = deposit.instructions || row.paymentInstructions;
    }

    return toSettingsView(await this.settingsRepository.save(row), true);
  }

  async list(user: AuthenticatedUser, query: QueryBookingRequestsDto) {
    const { companyId, companyWorkerId } = this.scope(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const base = () => {
      const qb = this.requestRepository
        .createQueryBuilder('r')
        .where('r.companyId = :companyId', { companyId });
      if (companyWorkerId) {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM session_detail d
                   WHERE d.session_id = r.session_id
                     AND d.company_worker_id = :companyWorkerId)`,
          { companyWorkerId },
        );
      }
      return qb;
    };

    const qb = base();
    if (query.status?.length) {
      qb.andWhere('r.status IN (:...statuses)', { statuses: query.status });
    }
    if (query.search) {
      const term = `%${query.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('r.guestName LIKE :term', { term })
            .orWhere('r.guestEmail LIKE :term', { term })
            .orWhere('r.guestPhone LIKE :term', { term }),
        ),
      );
    }
    qb.orderBy(
      `CASE WHEN r.status IN ('pending_approval','pending_payment') THEN 0 ELSE 1 END`,
      'ASC',
    )
      .addOrderBy('r.expiresAt', 'ASC')
      .addOrderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const pending = await base()
      .andWhere('r.status IN (:...pending)', { pending: PENDING_STATUSES })
      .getCount();

    const settings = await this.settingsRepository.findOne({
      where: { companyId },
    });

    return {
      data: await this.toViews(rows, user, settings),
      meta: { page, limit, total, pending },
    };
  }

  async approve(user: AuthenticatedUser, sessionId: number) {
    const request = await this.findReviewable(user, sessionId);

    request.status = 'confirmed';
    request.expiresAt = null;
    request.reviewedByUserId = user.sub;
    request.reviewedAt = new Date();
    await this.requestRepository.save(request);

    await this.linkClientToCompany(request);
    await this.realtimeEmitter.emitStatusChanged(sessionId);
    if (request.isNewAccount) {
      this.sendNewAccountCredentials(request).catch((err) =>
        this.logger.error(
          `Error enviando credenciales de la reserva ${sessionId}`,
          err as Error,
        ),
      );
    }
    this.sessionService
      .sendConfirmationEmailsForSession(sessionId)
      .catch((err) =>
        this.logger.error(
          `Error enviando la confirmación de la reserva ${sessionId}`,
          err as Error,
        ),
      );

    return this.toView(request, user);
  }

  async reject(user: AuthenticatedUser, sessionId: number, reason?: string) {
    const request = await this.findReviewable(user, sessionId);

    request.status = 'rejected';
    request.expiresAt = null;
    request.rejectionReason = reason || null;
    request.reviewedByUserId = user.sub;
    request.reviewedAt = new Date();

    await this.closeSession(request, 'rejected', user.userType);
    return this.toView(request, user);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expirePending(): Promise<number> {
    const expired = await this.requestRepository.find({
      where: { status: In(PENDING_STATUSES), expiresAt: LessThan(new Date()) },
      take: 100,
    });
    for (const request of expired) {
      try {
        request.status = 'expired';
        await this.closeSession(request, 'expired', 'system');
      } catch (err) {
        this.logger.error(
          `No se pudo vencer la reserva por enlace ${request.sessionId}`,
          err as Error,
        );
      }
    }
    if (expired.length) {
      this.logger.log(`⏰ ${expired.length} reserva(s) por enlace vencidas`);
    }
    return expired.length;
  }

  private async closeSession(
    request: PublicBookingRequest,
    status: 'rejected' | 'expired',
    cancelledBy: string,
  ) {
    const text = request.rejectionReason
      ? `${CLOSED_TEXT[status]}: ${request.rejectionReason}`
      : CLOSED_TEXT[status];

    await this.requestRepository.manager.transaction(async (manager) => {
      await manager.save(request);
      await manager
        .createQueryBuilder()
        .update(Session)
        .set({
          sessionStatus: 5,
          cancelledBy,
          cancellationReason: text,
        })
        .where('id = :id', { id: request.sessionId })
        .execute();
      await manager
        .createQueryBuilder()
        .update(SessionDetail)
        .set({ status: 5, cancelledBy, cancelReason: text })
        .where('sessionId = :id', { id: request.sessionId })
        .execute();
    });

    await this.realtimeEmitter.emitCancelled(
      request.sessionId,
      text,
      cancelledBy,
    );
    this.sendNotConfirmedEmail(request, status === 'expired').catch((err) =>
      this.logger.error(
        `Error enviando el aviso de reserva no confirmada ${request.sessionId}`,
        err as Error,
      ),
    );
  }

  private async linkClientToCompany(request: PublicBookingRequest) {
    const session = await this.sessionRepository.findOne({
      where: { id: request.sessionId },
    });
    if (!session) return;
    const client = await this.clientRepository.findOne({
      where: { id: session.clientId },
    });
    if (!client) return;

    const companies = Array.isArray(client.companies) ? client.companies : [];
    const firstAppointments = Array.isArray(client.companyFirstAppointments)
      ? client.companyFirstAppointments
      : [];
    const isNewCompany = !companies.includes(request.companyId);
    const hasFirst = firstAppointments.some(
      (fa) => Number(fa.companyId) === request.companyId,
    );
    if (!isNewCompany && hasFirst) return;

    await this.clientRepository.update(client.id, {
      companies: isNewCompany ? [...companies, request.companyId] : companies,
      companyFirstAppointments: hasFirst
        ? firstAppointments
        : [
            ...firstAppointments,
            {
              companyId: request.companyId,
              firstAppointmentDate:
                session.startDatetime ?? session.sessionDatetime,
            },
          ],
    });
  }

  private async sendNewAccountCredentials(request: PublicBookingRequest) {
    const session = await this.sessionRepository.findOne({
      where: { id: request.sessionId },
    });
    const client = session
      ? await this.clientRepository.findOne({ where: { id: session.clientId } })
      : null;
    const user = client?.userId
      ? await this.userRepository.findOne({ where: { id: client.userId } })
      : null;
    if (!user?.email) return;

    const password = generateSimplePassword();
    await this.userRepository.update(user.id, {
      password: await bcrypt.hash(password, 10),
    });
    await this.emailService.sendClientCredentials(
      user.email,
      user.username,
      password,
    );
  }

  private async sendNotConfirmedEmail(
    request: PublicBookingRequest,
    expired: boolean,
  ) {
    const [session, services, company] = await Promise.all([
      this.sessionRepository.findOne({ where: { id: request.sessionId } }),
      this.serviceNames(request.sessionId),
      this.companyRepository.findOne({ where: { id: request.companyId } }),
    ]);
    if (!session) return;
    const when = this.emailService.formatSessionDate(session.sessionDatetime);
    await this.emailService.sendLinkBookingNotConfirmedToClient(
      request.guestEmail,
      request.guestName,
      {
        date: when.date,
        time: when.time,
        services,
        reason: request.rejectionReason,
        expired,
      },
      {
        name: company?.name ?? '',
        email: company?.email ?? '',
        address: company?.location ?? '',
      },
    );
  }

  private async serviceNames(sessionId: number): Promise<string[]> {
    const details = await this.sessionDetailRepository.find({
      where: { sessionId },
    });
    if (!details.length) return [];
    const services = await this.serviceRepository.find({
      where: { id: In([...new Set(details.map((d) => d.serviceId))]) },
    });
    const byId = new Map(services.map((s) => [s.id, s.name]));
    return details.map((d) => byId.get(d.serviceId) ?? 'Servicio');
  }

  private async findReviewable(user: AuthenticatedUser, sessionId: number) {
    const { companyId } = this.scope(user);
    const request = await this.requestRepository.findOne({
      where: { sessionId, companyId },
    });
    if (!request) {
      throw new NotFoundException('No encontramos esta reserva.');
    }
    const settings = await this.settingsRepository.findOne({
      where: { companyId },
    });
    if (!(await this.canReview(user, request, settings))) {
      throw new ForbiddenException(
        'No tienes permiso para confirmar esta reserva.',
      );
    }
    if (!PENDING_STATUSES.includes(request.status)) {
      const word: Record<BookingRequestStatus, string> = {
        confirmed: 'ya fue confirmada',
        rejected: 'ya fue rechazada',
        expired: 'ya venció',
        pending_approval: '',
        pending_payment: '',
      };
      throw new ConflictException(`Esta reserva ${word[request.status]}.`);
    }
    return request;
  }

  private async canReview(
    user: AuthenticatedUser,
    request: PublicBookingRequest,
    settings: CompanyBookingSettings | null,
  ): Promise<boolean> {
    if (user.userType === 'adm') return true;
    if (user.userType !== 'wrk' || !settings?.workersCanApprove) return false;
    return this.isWorkerOf(user.companyWorkerId, request.sessionId);
  }

  private async isWorkerOf(
    companyWorkerId: number | null,
    sessionId: number,
  ): Promise<boolean> {
    if (!companyWorkerId) return false;
    const count = await this.sessionDetailRepository.count({
      where: { sessionId, companyWorkerId },
    });
    return count > 0;
  }

  private scope(user: AuthenticatedUser): {
    companyId: number;
    companyWorkerId: number | null;
  } {
    if (!user.companyId) {
      throw new ForbiddenException('No perteneces a ningún negocio.');
    }
    if (user.userType === 'wrk' && !user.companyWorkerId) {
      throw new ForbiddenException('No perteneces a ningún negocio.');
    }
    return {
      companyId: user.companyId,
      companyWorkerId: user.userType === 'wrk' ? user.companyWorkerId : null,
    };
  }

  private async toView(request: PublicBookingRequest, user: AuthenticatedUser) {
    const settings = await this.settingsRepository.findOne({
      where: { companyId: request.companyId },
    });
    const [view] = await this.toViews([request], user, settings);
    return view;
  }

  private async toViews(
    rows: PublicBookingRequest[],
    user: AuthenticatedUser,
    settings: CompanyBookingSettings | null,
  ) {
    if (!rows.length) return [];
    const sessionIds = rows.map((r) => r.sessionId);

    const [sessions, details] = await Promise.all([
      this.sessionRepository.find({ where: { id: In(sessionIds) } }),
      this.sessionDetailRepository.find({
        where: { sessionId: In(sessionIds) },
        order: { startDatetime: 'ASC' },
      }),
    ]);

    const [services, companyWorkers, reviewers] = await Promise.all([
      details.length
        ? this.serviceRepository.find({
            where: { id: In([...new Set(details.map((d) => d.serviceId))]) },
          })
        : Promise.resolve([] as Service[]),
      details.length
        ? this.companyWorkerRepository.find({
            where: {
              id: In([
                ...new Set(
                  details.map((d) => d.companyWorkerId).filter(Boolean),
                ),
              ]),
            },
            relations: ['worker'],
          })
        : Promise.resolve([] as CompanyWorker[]),
      this.reviewerNames(
        rows.map((r) => r.reviewedByUserId).filter((id): id is number => !!id),
      ),
    ]);

    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const clientIds = [...new Set(sessions.map((s) => s.clientId))];
    const clients = clientIds.length
      ? await this.clientRepository.find({ where: { id: In(clientIds) } })
      : [];
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const serviceById = new Map(services.map((s) => [s.id, s]));
    const workerById = new Map(companyWorkers.map((cw) => [cw.id, cw]));

    return Promise.all(
      rows.map(async (r) => {
        const own = details.filter((d) => d.sessionId === r.sessionId);
        const session = sessionById.get(r.sessionId);
        const pending = PENDING_STATUSES.includes(r.status);
        const canReview =
          pending &&
          (user.userType === 'adm' ||
            (user.userType === 'wrk' &&
              !!settings?.workersCanApprove &&
              own.some((d) => d.companyWorkerId === user.companyWorkerId)));

        return {
          sessionId: r.sessionId,
          publicCode: session?.publicCode ?? null,
          status: r.status,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          startDatetime:
            own[0]?.startDatetime ?? session?.sessionDatetime ?? null,
          guest: {
            name: r.guestName,
            email: r.guestEmail,
            phone: r.guestPhone,
            identification: r.guestIdentification,
          },
          systemName: systemNameFor(
            clientById.get(session?.clientId ?? 0),
            r.guestName,
          ),
          services: own.map((d) => {
            const service = serviceById.get(d.serviceId);
            const cw = workerById.get(d.companyWorkerId);
            return {
              detailId: d.id,
              name: service?.name ?? 'Servicio',
              workerName: cw?.worker?.name ?? '',
              companyWorkerId: d.companyWorkerId,
              startDatetime: d.startDatetime,
              durationMinutes: Number(d.totalTime) || 0,
              cost: Number(d.cost) || 0,
              currency: service?.currency ?? 'USD',
            };
          }),
          deposit:
            r.depositAmount !== null
              ? {
                  amount: Number(r.depositAmount),
                  currency: r.depositCurrency ?? 'USD',
                  reference: r.paymentReference,
                  proofUrl:
                    user.userType === 'adm' || !!settings?.workersCanApprove
                      ? r.paymentProofUrl
                      : null,
                }
              : null,
          rejectionReason: r.rejectionReason,
          reviewedBy: r.reviewedByUserId
            ? { name: reviewers.get(r.reviewedByUserId) ?? '' }
            : null,
          reviewedAt: r.reviewedAt,
          canReview,
        };
      }),
    );
  }

  private async reviewerNames(userIds: number[]): Promise<Map<number, string>> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return new Map();
    const [workers, users] = await Promise.all([
      this.workerRepository.find({ where: { userId: In(ids) } }),
      this.userRepository.find({ where: { id: In(ids) } }),
    ]);
    const names = new Map<number, string>();
    for (const u of users) names.set(u.id, u.username);
    for (const w of workers) {
      if (w.userId && w.name) names.set(w.userId, w.name.trim());
    }
    return names;
  }
}

function systemNameFor(
  client: Client | undefined,
  guestName: string,
): string | null {
  if (!client) return null;
  const name = [client.name, client.lastName].filter(Boolean).join(' ').trim();
  if (!name) return null;
  const norm = (v: string) => v.trim().toLowerCase().replace(/s+/g, ' ');
  return norm(name) === norm(guestName) ? null : name;
}

export function toSettingsView(
  row: CompanyBookingSettings | null,
  includeInactiveDeposit = false,
): BookingSettingsView {
  if (!row) {
    return {
      mode: 'free',
      leadMinutes: DEFAULT_LEAD_MINUTES,
      holdHours: DEFAULT_HOLD_HOURS,
      workersCanApprove: false,
      deposit: null,
    };
  }
  return {
    mode: row.mode,
    leadMinutes: row.leadMinutes,
    holdHours: row.holdHours,
    workersCanApprove: !!row.workersCanApprove,
    deposit:
      (includeInactiveDeposit || row.mode === 'deposit') && row.depositType
        ? {
            type: row.depositType,
            amount:
              row.depositAmount !== null ? Number(row.depositAmount) : null,
            percent: row.depositPercent,
            currency: row.depositCurrency,
            instructions: row.paymentInstructions ?? '',
          }
        : null,
  };
}
