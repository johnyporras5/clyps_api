import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, SelectQueryBuilder } from 'typeorm';
import { CompanyFeedback } from './entities/company_feedback.entity';
import { CreateCompanyFeedbackDto } from './dto/create-company_feedback.dto';
import { UpdateCompanyFeedbackDto } from './dto/update-company_feedback.dto';
import { Company } from '../company/entities/company.entity';
import { Client } from '../client/entities/client.entity';
import { Session } from '../session/entities/session.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { Service } from '../service/entities/service.entity';
import { Worker } from '../worker/entities/worker.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { FileUploadService } from '../common/services/file_upload.service';
import { WorkerFeedbackStatsDto } from '../worker/dto/worker-feedback-stats.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { companyRoom } from '../realtime/rooms';

// El campo `stats` ahora va anidado dentro de cada feedback.company (un card
// por compañía). El resultado paginado mantiene la forma estándar.
export type CompanyFeedbackPaginatedResult =
  PaginationResult<CompanyFeedback> & {
    stats?: WorkerFeedbackStatsDto;
  };
@Injectable()
export class CompanyFeedbackService {
  constructor(
    @InjectRepository(CompanyFeedback)
    private companyFeedbackRepository: Repository<CompanyFeedback>,

    @InjectRepository(Company)
    private companyRepository: Repository<Company>,

    @InjectRepository(Client)
    private clientRepository: Repository<Client>,

    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,

    @InjectRepository(SessionDetail)
    private sessionDetailRepository: Repository<SessionDetail>,

    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,

    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,

    private fileUploadService: FileUploadService,
    private readonly realtime: RealtimeService,
  ) {}

  async findOne(id: number): Promise<CompanyFeedback> {
    const feedback = await this.companyFeedbackRepository
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.company', 'company')
      .leftJoinAndMapOne(
        'feedback.client',
        Client,
        'client',
        'client.userId = feedback.clientId',
      )
      .where('feedback.id = :id', { id })
      .getOne();
    if (!feedback)
      throw new NotFoundException(`CompanyFeedback with id ${id} not found`);
    await this.hydrateFeedbacks([feedback]);
    return feedback;
  }

  async create(
    createDto: CreateCompanyFeedbackDto,
    companyId: number,
    clientId?: number,
  ): Promise<CompanyFeedback> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company)
      throw new NotFoundException(`Company with id ${companyId} not found`);

    if (createDto.stars < 1 || createDto.stars > 5)
      throw new BadRequestException('stars must be between 1 and 5');

    const data: DeepPartial<CompanyFeedback> = {
      stars: createDto.stars,
      description: createDto.description,
      companyId,
      clientId: clientId ?? null,
      sessionId: createDto.sessionId ?? null,
    };

    const feedback = this.companyFeedbackRepository.create(data);
    const saved = await this.companyFeedbackRepository.save(feedback);

    // Si el cliente envió la calificación vinculada a una sesión, marcar la
    // sesión como RATED (sessionStatus = 6) para que el flujo de
    // "Calificar Servicio" no la siga proponiendo.
    if (createDto.sessionId && clientId) {
      await this.markSessionAsRatedIfOwned(createDto.sessionId, clientId);
    }

    await this.emitReviewCreated(saved);

    return saved;
  }

  /**
   * Emite review.company_created con el feedback + stats agregadas recalculadas
   * de la compañía (CLYP-242). Room: company:<companyId>.
   * Best-effort: nunca rompe la creación del feedback.
   */
  private async emitReviewCreated(feedback: CompanyFeedback): Promise<void> {
    try {
      const statsMap = await this.computeStatsByCompany([feedback.companyId]);
      const stats = statsMap.get(feedback.companyId) ?? this.emptyStats();

      this.realtime.emitEntity(companyRoom(feedback.companyId), {
        type: 'review.company_created',
        entityId: feedback.id,
        companyId: feedback.companyId,
        data: { feedback, stats },
      });
    } catch {
      // best-effort
    }
  }

  /**
   * Marca la sesión como RATED (sessionStatus = 6) sólo si:
   *  - existe,
   *  - pertenece al cliente autenticado (userId del token → clientId),
   *  - está actualmente en PAID (sessionStatus = 4).
   * No lanza error si no se cumplen las condiciones: la calificación ya se
   * guardó y el frontend no debe romper por un cambio de estado opcional.
   */
  private async markSessionAsRatedIfOwned(
    sessionId: number,
    clientUserId: number,
  ): Promise<void> {
    try {
      const client = await this.clientRepository.findOne({
        where: { userId: clientUserId },
      });
      if (!client) return;

      const session = await this.sessionRepository.findOne({
        where: { id: sessionId },
      });
      if (!session) return;
      if (session.clientId !== client.id) return;
      if (session.sessionStatus !== 4) return;

      await this.sessionRepository.update(
        { id: sessionId, clientId: session.clientId },
        { sessionStatus: 6 },
      );
    } catch {
      // best-effort: no romper la creación del feedback por un fallo aquí
    }
  }

  async update(
    id: number,
    updateDto: UpdateCompanyFeedbackDto,
    requesterUserId?: number,
    requesterUserType?: string,
  ): Promise<CompanyFeedback> {
    const feedback = await this.companyFeedbackRepository.findOne({
      where: { id },
    });
    if (!feedback)
      throw new NotFoundException(`CompanyFeedback with id ${id} not found`);

    if (
      requesterUserId &&
      feedback.clientId &&
      requesterUserId !== feedback.clientId &&
      requesterUserType !== 'adm'
    ) {
      throw new ForbiddenException(
        'No tienes permiso para actualizar este feedback',
      );
    }

    if (
      updateDto.stars !== undefined &&
      (updateDto.stars < 1 || updateDto.stars > 5)
    ) {
      throw new BadRequestException('stars must be between 1 and 5');
    }

    Object.assign(feedback, updateDto);
    return await this.companyFeedbackRepository.save(feedback);
  }

  async remove(
    id: number,
    requesterUserId?: number,
    requesterUserType?: string,
  ): Promise<void> {
    const feedback = await this.companyFeedbackRepository.findOne({
      where: { id },
    });
    if (!feedback)
      throw new NotFoundException(`CompanyFeedback with id ${id} not found`);

    if (
      requesterUserId &&
      feedback.clientId &&
      requesterUserId !== feedback.clientId &&
      requesterUserType !== 'adm'
    ) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar este feedback',
      );
    }

    const result = await this.companyFeedbackRepository.delete(id);
    if (result.affected === 0)
      throw new NotFoundException(`CompanyFeedback with id ${id} not found`);
  }

  async findByCompany(
    userId: number,
    page = 1,
    limit = 10,
  ): Promise<CompanyFeedbackPaginatedResult> {
    const company = await this.companyRepository.findOne({ where: { userId } });
    if (!company) {
      throw new NotFoundException(`No company found for user id ${userId}`);
    }

    const queryBuilder: SelectQueryBuilder<CompanyFeedback> =
      this.companyFeedbackRepository
        .createQueryBuilder('feedback')
        .leftJoinAndSelect('feedback.company', 'company')
        .leftJoinAndMapOne(
          'feedback.client',
          Client,
          'client',
          'client.userId = feedback.clientId',
        )
        .where('feedback.companyId = :companyId', { companyId: company.id })
        .orderBy('feedback.datetime', 'DESC');

    const result = await paginate<CompanyFeedback>(queryBuilder, {
      page,
      limit,
    });

    // Hidratar (sin stats redundantes)
    await this.hydrateFeedbacks(result.data);

    // Calcular estadísticas de la compañía una sola vez
    const statsMap = await this.computeStatsByCompany([company.id]);
    const stats = statsMap.get(company.id) ?? this.emptyStats();

    // Adjuntar stats al resultado paginado
    const finalResult = result as CompanyFeedbackPaginatedResult;
    finalResult.stats = stats;

    return finalResult;
  }
  /**
   * Hidrata cada feedback con:
   *  - client.pictureUrl.
   *  - company.stats: promedio + conteo por estrella de esa compañía.
   *  - `services`: arreglo con los servicios prestados en la sesión asociada
   *    al feedback (sólo cuando hay sessionId). Cada servicio incluye su
   *    categoría y el trabajador que lo realizó.
   */
  private async hydrateFeedbacks(feedbacks: CompanyFeedback[]): Promise<void> {
    if (feedbacks.length === 0) return;

    // 1. URLs de imágenes y limpiar services
    for (const feedback of feedbacks) {
      if (feedback.client?.picture) {
        feedback.client.pictureUrl = this.fileUploadService.getFileUrl(
          'client_photo',
          feedback.client.picture,
        );
      }
      feedback.services = [];
    }

    // 2. Servicios de las sesiones (sin tocar stats)
    const sessionIds = Array.from(
      new Set(
        feedbacks
          .map((f) => f.sessionId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    if (sessionIds.length > 0) {
      const rows: Array<{
        sessionId: number;
        serviceId: number;
        workerId: number | null;
      }> = await this.sessionDetailRepository
        .createQueryBuilder('sd')
        .leftJoin(CompanyWorker, 'cw', 'cw.id = sd.companyWorkerId')
        .select('sd.session_id', 'sessionId')
        .addSelect('sd.service_id', 'serviceId')
        .addSelect('cw.worker_id', 'workerId')
        .where('sd.session_id IN (:...sessionIds)', { sessionIds })
        .getRawMany();

      if (rows.length > 0) {
        const serviceIds = Array.from(new Set(rows.map((r) => r.serviceId)));
        const workerIds = Array.from(
          new Set(
            rows
              .map((r) => r.workerId)
              .filter((id): id is number => typeof id === 'number'),
          ),
        );

        const [services, workers] = await Promise.all([
          this.serviceRepository.find({
            where: serviceIds.map((id) => ({ id })),
          }),
          workerIds.length > 0
            ? this.workerRepository.find({
                where: workerIds.map((id) => ({ id })),
              })
            : Promise.resolve([] as Worker[]),
        ]);
        const serviceById = new Map(services.map((s) => [s.id, s]));
        const workerById = new Map(workers.map((w) => [w.id, w]));

        const grouped = new Map<
          number,
          Array<{ serviceId: number; workerId: number | null }>
        >();
        for (const r of rows) {
          const arr = grouped.get(r.sessionId) ?? [];
          arr.push({ serviceId: r.serviceId, workerId: r.workerId });
          grouped.set(r.sessionId, arr);
        }

        for (const feedback of feedbacks) {
          if (typeof feedback.sessionId !== 'number') continue;
          const entries = grouped.get(feedback.sessionId);
          if (!entries) continue;
          feedback.services = entries.flatMap((entry) => {
            const svc = serviceById.get(entry.serviceId);
            if (!svc) return [];
            const wrk =
              entry.workerId != null
                ? workerById.get(entry.workerId)
                : undefined;
            return [
              {
                id: svc.id,
                name: svc.name ?? null,
                category: svc.category
                  ? { id: svc.category.id, name: svc.category.name }
                  : null,
                worker: wrk ? { id: wrk.id, name: wrk.name ?? null } : null,
              },
            ];
          });
        }
      }
    }
    for (const feedback of feedbacks) {
      if (feedback.client) {
        // console.log(
        //   `Reemplazando clientId: antes ${feedback.clientId}, después ${feedback.client.id}`
        // );
        feedback.clientId = feedback.client.id;
      }
    }
  }

  /**
   * Stats por compañía en una sola query. Devuelve un map companyId → stats.
   * Las compañías sin reseñas reciben stats vacías.
   */
  private async computeStatsByCompany(
    companyIds: number[],
  ): Promise<Map<number, WorkerFeedbackStatsDto>> {
    const result = new Map<number, WorkerFeedbackStatsDto>();
    for (const cid of companyIds) result.set(cid, this.emptyStats());
    if (companyIds.length === 0) return result;

    const rows: Array<{
      companyId: number;
      stars: number | null;
      count: string;
    }> = await this.companyFeedbackRepository
      .createQueryBuilder('feedback')
      .select('feedback.companyId', 'companyId')
      .addSelect('feedback.stars', 'stars')
      .addSelect('COUNT(*)', 'count')
      .where('feedback.companyId IN (:...companyIds)', { companyIds })
      .groupBy('feedback.companyId')
      .addGroupBy('feedback.stars')
      .getRawMany();

    const totals = new Map<number, { total: number; weighted: number }>();
    for (const cid of companyIds) totals.set(cid, { total: 0, weighted: 0 });

    for (const row of rows) {
      const cid = Number(row.companyId);
      const stars = row.stars == null ? null : Number(row.stars);
      const count = Number(row.count);
      if (stars === null) continue;

      const stats = result.get(cid);
      const acc = totals.get(cid);
      if (!stats || !acc) continue;

      acc.total += count;
      acc.weighted += stars * count;
      switch (stars) {
        case 5:
          stats.fiveStarCount = count;
          break;
        case 4:
          stats.fourStarCount = count;
          break;
        case 3:
          stats.threeStarCount = count;
          break;
        case 2:
          stats.twoStarCount = count;
          break;
        case 1:
          stats.oneStarCount = count;
          break;
      }
    }

    for (const cid of companyIds) {
      const stats = result.get(cid);
      const acc = totals.get(cid);
      if (!stats || !acc) continue;
      stats.totalFeedbacks = acc.total;
      stats.averageStars =
        acc.total === 0 ? 0 : Number((acc.weighted / acc.total).toFixed(2));
    }

    return result;
  }

  private emptyStats(): WorkerFeedbackStatsDto {
    return {
      averageStars: 0,
      totalFeedbacks: 0,
      fiveStarCount: 0,
      fourStarCount: 0,
      threeStarCount: 0,
      twoStarCount: 0,
      oneStarCount: 0,
    };
  }
}
