import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, SelectQueryBuilder } from 'typeorm';
import { WorkerFeedback } from './entities/worker_feedback.entity';
import { CreateWorkerFeedbackDto } from './dto/create-worker_feedback.dto';
import { UpdateWorkerFeedbackDto } from './dto/update-worker_feedback.dto';
import { Worker } from '../worker/entities/worker.entity';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Company } from 'src/company/entities/company.entity';
import { Client } from 'src/client/entities/client.entity';
import { Session } from 'src/session/entities/session.entity';
import { SessionDetail } from 'src/session_detail/entities/session_detail.entity';
import { Service } from 'src/service/entities/service.entity';
import { FileUploadService } from 'src/common/services/file_upload.service';
import { WorkerFeedbackStatsDto } from 'src/worker/dto/worker-feedback-stats.dto';

// Cada feedback trae sus stats individuales en `feedback.worker.stats`. El
// resultado paginado también incluye `stats` a nivel root: estadísticas
// globales del conjunto consultado (todos los workers de la compañía del
// admin, o el worker concreto cuando hay filtro).
export type WorkerFeedbackPaginatedResult = PaginationResult<WorkerFeedback> & {
  stats: WorkerFeedbackStatsDto;
};

@Injectable()
export class WorkerFeedbackService {
  constructor(
    @InjectRepository(WorkerFeedback)
    private workerFeedbackRepository: Repository<WorkerFeedback>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @InjectRepository(SessionDetail)
    private sessionDetailRepository: Repository<SessionDetail>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    private fileUploadService: FileUploadService,
  ) {}

  async findOne(id: number): Promise<WorkerFeedback> {
    const feedback = await this.workerFeedbackRepository
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.worker', 'worker')
      .leftJoinAndMapOne(
        'feedback.client',
        Client,
        'client',
        'client.userId = feedback.clientId',
      )
      .where('feedback.id = :id', { id })
      .getOne();
    if (!feedback) {
      throw new NotFoundException(`WorkerFeedback with id ${id} not found`);
    }
    await this.hydrateFeedbacks([feedback]);
    return feedback;
  }

  /**
   * Crea un feedback para el workerId dado.
   * clientId debe venir del token en el controlador.
   */
  async create(
    createDto: CreateWorkerFeedbackDto,
    workerId: number,
    clientId?: number,
  ): Promise<WorkerFeedback> {
    // Validar existencia del worker
    const worker = await this.workerRepository.findOne({
      where: { id: workerId },
    });
    if (!worker) {
      throw new NotFoundException(`Worker with id ${workerId} not found`);
    }

    // Validar stars (class-validator ya lo hace si usas pipes, pero doble-check)
    if (createDto.stars < 1 || createDto.stars > 5) {
      throw new BadRequestException('stars must be between 1 and 5');
    }

    const feedbackData: DeepPartial<WorkerFeedback> = {
      stars: createDto.stars,
      description: createDto.description,
      workerId,
      clientId: clientId ?? null,
      sessionId: createDto.sessionId ?? null,
    };

    const feedback = this.workerFeedbackRepository.create(feedbackData);
    const saved = await this.workerFeedbackRepository.save(feedback);

    // Si el cliente vinculó la calificación a una sesión, marcarla como RATED
    // (sessionStatus = 6) para que no vuelva a aparecer como "pendiente de calificar".
    if (createDto.sessionId && clientId) {
      await this.markSessionAsRatedIfOwned(createDto.sessionId, clientId);
    }

    return saved;
  }

  /**
   * Marca la sesión como RATED (sessionStatus = 6) sólo si:
   *  - existe,
   *  - pertenece al cliente autenticado (userId del token → clientId),
   *  - está actualmente en PAID (sessionStatus = 4).
   * Best-effort: no rompe la creación del feedback si falla.
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
      // best-effort
    }
  }

  async update(
    id: number,
    updateDto: UpdateWorkerFeedbackDto,
    requesterUserId?: number,
    requesterUserType?: string,
  ): Promise<WorkerFeedback> {
    const feedback = await this.workerFeedbackRepository.findOne({
      where: { id },
    });
    if (!feedback) {
      throw new NotFoundException(`WorkerFeedback with id ${id} not found`);
    }

    // Permisos: solo el autor (clientId) o admin puede actualizar
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
    return await this.workerFeedbackRepository.save(feedback);
  }

  async remove(
    id: number,
    requesterUserId?: number,
    requesterUserType?: string,
  ): Promise<void> {
    const feedback = await this.workerFeedbackRepository.findOne({
      where: { id },
    });
    if (!feedback) {
      throw new NotFoundException(`WorkerFeedback with id ${id} not found`);
    }

    // Permisos: solo autor o admin puede borrar
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

    const result = await this.workerFeedbackRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`WorkerFeedback with id ${id} not found`);
    }
  }

  async findByWorker(
    workerId: number,
    page = 1,
    limit = 10,
  ): Promise<WorkerFeedbackPaginatedResult> {
    // Verificar que el worker existe
    const worker = await this.workerRepository.findOne({
      where: { id: workerId },
    });
    if (!worker) {
      throw new NotFoundException(`Worker with id ${workerId} not found`);
    }

    // Crear query builder con joins de worker + client para hidratar la respuesta
    const queryBuilder: SelectQueryBuilder<WorkerFeedback> =
      this.workerFeedbackRepository
        .createQueryBuilder('feedback')
        .leftJoinAndSelect('feedback.worker', 'worker')
        .leftJoinAndMapOne(
          'feedback.client',
          Client,
          'client',
          'client.userId = feedback.clientId',
        )
        .where('feedback.workerId = :workerId', { workerId })
        .orderBy('feedback.datetime', 'DESC');

    const result = await paginate<WorkerFeedback>(queryBuilder, {
      page,
      limit,
    });

    await this.hydrateFeedbacks(result.data);

    // Stats globales del worker consultado
    const stats = await this.computeAggregateStats(
      this.workerFeedbackRepository
        .createQueryBuilder('feedback')
        .where('feedback.workerId = :workerId', { workerId }),
    );

    return { ...result, stats };
  }

  /**
   * Lista todas las reseñas de los barberos que pertenecen a la compañía del admin autenticado.
   * @param userId - ID del usuario admin (del token)
   * @param page - Número de página
   * @param limit - Elementos por página
   */
  async findAllByAdminCompany(
    userId: number,
    page = 1,
    limit = 10,
    workerId?: number,
  ): Promise<WorkerFeedbackPaginatedResult> {
    // 1. Buscar la compañía asociada al usuario admin
    const company = await this.companyRepository.findOne({ where: { userId } });
    if (!company) {
      throw new NotFoundException(`No company found for user ${userId}`);
    }

    // 2. Subconsulta: obtener todos los workerId de los barberos activos en esa compañía
    const workerIdsSubQuery = this.companyWorkerRepository
      .createQueryBuilder('cw')
      .select('cw.workerId')
      .where('cw.companyId = :companyId', { companyId: company.id })
      .andWhere('cw.permanentlyDeleted = false'); // Opcional: excluir borrados

    // 2b. Si se pasó workerId, validar que pertenece a la compañía del admin
    if (workerId !== undefined) {
      const belongsToCompany = await this.companyWorkerRepository
        .createQueryBuilder('cw')
        .where('cw.companyId = :companyId', { companyId: company.id })
        .andWhere('cw.workerId = :workerId', { workerId })
        .andWhere('cw.permanentlyDeleted = false')
        .getCount();
      if (belongsToCompany === 0) {
        throw new ForbiddenException(
          `Worker ${workerId} no pertenece a esta compañía`,
        );
      }
    }

    // 3. Consulta principal: feedbacks cuyo workerId esté en la subconsulta
    //    (filtrando además por workerId si fue provisto)
    const queryBuilder = this.workerFeedbackRepository
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.worker', 'worker')
      .leftJoinAndMapOne(
        'feedback.client',
        Client,
        'client',
        'client.userId = feedback.clientId',
      )
      .where(`feedback.workerId IN (${workerIdsSubQuery.getQuery()})`)
      .setParameters(workerIdsSubQuery.getParameters())
      .orderBy('feedback.datetime', 'DESC');

    if (workerId !== undefined) {
      queryBuilder.andWhere('feedback.workerId = :targetWorkerId', {
        targetWorkerId: workerId,
      });
    }

    // 4. Paginar usando el helper
    const result = await paginate<WorkerFeedback>(queryBuilder, {
      page,
      limit,
    });

    // 5. Hidratar pictureUrls, servicios y stats por worker
    //    (stats individuales van dentro de feedback.worker.stats).
    await this.hydrateFeedbacks(result.data);

    // 6. Stats globales del scope consultado:
    //    - si hay workerId, sólo ese worker;
    //    - si no, todos los workers de la compañía.
    const statsQb = this.workerFeedbackRepository
      .createQueryBuilder('feedback')
      .where(`feedback.workerId IN (${workerIdsSubQuery.getQuery()})`)
      .setParameters(workerIdsSubQuery.getParameters());
    if (workerId !== undefined) {
      statsQb.andWhere('feedback.workerId = :targetWorkerId', {
        targetWorkerId: workerId,
      });
    }
    const stats = await this.computeAggregateStats(statsQb);

    return { ...result, stats };
  }

  /**
   * Obtiene todas las reseñas del worker autenticado mediante su userId.
   * @param userId - ID del usuario (extraído del token)
   * @param page - Número de página
   * @param limit - Elementos por página
   */
  async findMyFeedbacks(
    userId: number,
    page = 1,
    limit = 10,
  ): Promise<WorkerFeedbackPaginatedResult> {
    // 1. Buscar el worker asociado al userId
    const worker = await this.workerRepository.findOne({
      where: { userId },
    });

    if (!worker) {
      throw new NotFoundException(
        `No se encontró un perfil de worker para el usuario ${userId}`,
      );
    }

    // 2. Query con join al Client y al Worker para hidratar la respuesta
    const queryBuilder = this.workerFeedbackRepository
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.worker', 'worker')
      .leftJoinAndMapOne(
        'feedback.client',
        Client,
        'client',
        'client.userId = feedback.clientId',
      )
      .where('feedback.workerId = :workerId', { workerId: worker.id })
      .orderBy('feedback.datetime', 'DESC');

    // 3. Paginar
    const result = await paginate<WorkerFeedback>(queryBuilder, {
      page,
      limit,
    });

    // 4. Hidratar pictureUrls, servicios y worker.stats
    await this.hydrateFeedbacks(result.data);

    // 5. Stats globales del worker autenticado
    const stats = await this.computeAggregateStats(
      this.workerFeedbackRepository
        .createQueryBuilder('feedback')
        .where('feedback.workerId = :workerId', { workerId: worker.id }),
    );

    return { ...result, stats };
  }

  /**
   * Hidrata cada feedback con:
   *  - client.pictureUrl y worker.pictureUrl si tienen `picture`.
   *  - worker.stats: promedio + conteo por estrella del worker en la sesión
   *    asociada al feedback (no global). Si el feedback no tiene sessionId,
   *    se devuelven stats vacías.
   *  - `services`: arreglo de servicios prestados por el worker del feedback
   *    dentro de la sesión asociada (sólo cuando `sessionId` está presente).
   */
  private async hydrateFeedbacks(feedbacks: WorkerFeedback[]): Promise<void> {
    if (feedbacks.length === 0) return;

    // 1) URLs de imágenes (cliente y trabajador)
    for (const feedback of feedbacks) {
      if (feedback.client?.picture) {
        feedback.client.pictureUrl = this.fileUploadService.getFileUrl(
          'client_photo',
          feedback.client.picture,
        );
      }
      if (feedback.worker?.picture) {
        (feedback.worker as any).pictureUrl = this.fileUploadService.getFileUrl(
          'worker_photo',
          feedback.worker.picture,
        );
      }
      feedback.services = [];
    }

    // 1b) worker.stats: agregado de las estrellas que recibió ese worker
    //     EN ESA SESIÓN concreta (formato completo del DTO: promedio,
    //     totalFeedbacks y conteo por estrella). Si una sesión tuvo varios
    //     feedbacks para el mismo worker, todos los items de esa sesión
    //     comparten el mismo bloque.
    const pairs = feedbacks
      .filter((f) => typeof f.sessionId === 'number')
      .map((f) => ({
        workerId: f.workerId,
        sessionId: f.sessionId as number,
      }));
    const statsByPair = await this.computeStatsByWorkerSession(pairs);
    for (const feedback of feedbacks) {
      if (!feedback.worker) continue;
      if (typeof feedback.sessionId !== 'number') {
        (feedback.worker as any).stats = this.emptyStats();
        continue;
      }
      (feedback.worker as any).stats =
        statsByPair.get(`${feedback.workerId}:${feedback.sessionId}`) ??
        this.emptyStats();
    }

    // 2) Servicios prestados por el worker del feedback dentro de su sesión
    const sessionIds = Array.from(
      new Set(
        feedbacks
          .map((f) => f.sessionId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    if (sessionIds.length === 0) return;

    const workerIds = Array.from(new Set(feedbacks.map((f) => f.workerId)));

    // session_detail JOIN company_worker para resolver workerId del que prestó
    // el servicio en cada detalle de la sesión.
    const rows: Array<{
      sessionId: number;
      workerId: number;
      serviceId: number;
    }> = await this.sessionDetailRepository
      .createQueryBuilder('sd')
      .innerJoin(CompanyWorker, 'cw', 'cw.id = sd.companyWorkerId')
      .select('sd.session_id', 'sessionId')
      .addSelect('cw.worker_id', 'workerId')
      .addSelect('sd.service_id', 'serviceId')
      .where('sd.session_id IN (:...sessionIds)', { sessionIds })
      .andWhere('cw.worker_id IN (:...workerIds)', { workerIds })
      .getRawMany();

    if (rows.length === 0) return;

    const serviceIds = Array.from(new Set(rows.map((r) => r.serviceId)));
    const services = await this.serviceRepository.find({
      where: serviceIds.map((id) => ({ id })),
    });
    const serviceById = new Map(services.map((s) => [s.id, s]));

    // Indexar por (sessionId, workerId) → serviceIds
    const key = (sId: number, wId: number) => `${sId}:${wId}`;
    const grouped = new Map<string, Set<number>>();
    for (const r of rows) {
      const k = key(r.sessionId, r.workerId);
      const set = grouped.get(k) ?? new Set<number>();
      set.add(r.serviceId);
      grouped.set(k, set);
    }

    for (const feedback of feedbacks) {
      if (typeof feedback.sessionId !== 'number') continue;
      const ids = grouped.get(key(feedback.sessionId, feedback.workerId));
      if (!ids) continue;
      feedback.services = Array.from(ids).flatMap((id) => {
        const svc = serviceById.get(id);
        if (!svc) return [];
        return [
          {
            id: svc.id,
            name: svc.name ?? null,
            category: svc.category
              ? { id: svc.category.id, name: svc.category.name }
              : null,
          },
        ];
      });
    }

    for (const feedback of feedbacks) {
      if (feedback.client) {
        feedback.clientId = feedback.client.id;
      }
    }
  }

  /**
   * Stats por (worker, sesión). Devuelve un map clave `${workerId}:${sessionId}`
   * → stats. Resuelve la calificación que recibió el worker en una sesión
   * concreta (no global), en una sola query agrupando por worker_id,
   * session_id y stars.
   */
  private async computeStatsByWorkerSession(
    pairs: Array<{ workerId: number; sessionId: number }>,
  ): Promise<Map<string, WorkerFeedbackStatsDto>> {
    const key = (workerId: number, sessionId: number) =>
      `${workerId}:${sessionId}`;
    const result = new Map<string, WorkerFeedbackStatsDto>();
    for (const p of pairs) {
      result.set(key(p.workerId, p.sessionId), this.emptyStats());
    }
    if (pairs.length === 0) return result;

    const workerIds = Array.from(new Set(pairs.map((p) => p.workerId)));
    const sessionIds = Array.from(new Set(pairs.map((p) => p.sessionId)));

    const rows: Array<{
      workerId: number;
      sessionId: number;
      stars: number | null;
      count: string;
    }> = await this.workerFeedbackRepository
      .createQueryBuilder('feedback')
      .select('feedback.workerId', 'workerId')
      .addSelect('feedback.sessionId', 'sessionId')
      .addSelect('feedback.stars', 'stars')
      .addSelect('COUNT(*)', 'count')
      .where('feedback.workerId IN (:...workerIds)', { workerIds })
      .andWhere('feedback.sessionId IN (:...sessionIds)', { sessionIds })
      .groupBy('feedback.workerId')
      .addGroupBy('feedback.sessionId')
      .addGroupBy('feedback.stars')
      .getRawMany();

    const totals = new Map<string, { total: number; weighted: number }>();
    for (const p of pairs) {
      totals.set(key(p.workerId, p.sessionId), { total: 0, weighted: 0 });
    }

    for (const row of rows) {
      const wid = Number(row.workerId);
      const sid = Number(row.sessionId);
      const k = key(wid, sid);
      // Filtra combinaciones que el IN workerIds x IN sessionIds podría haber
      // traído de más; sólo acumulamos los pares pedidos.
      const stats = result.get(k);
      const acc = totals.get(k);
      if (!stats || !acc) continue;

      const stars = row.stars == null ? null : Number(row.stars);
      const count = Number(row.count);
      if (stars === null) continue;

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

    for (const p of pairs) {
      const k = key(p.workerId, p.sessionId);
      const stats = result.get(k);
      const acc = totals.get(k);
      if (!stats || !acc) continue;
      stats.totalFeedbacks = acc.total;
      stats.averageStars =
        acc.total === 0 ? 0 : Number((acc.weighted / acc.total).toFixed(2));
    }

    return result;
  }

  /**
   * Stats agregadas (promedio + conteo por estrella) sobre el conjunto de
   * feedbacks que satisfaga el WHERE del `baseQb`. Útil para devolver un
   * `stats` global del response sin importar cuántos workers haya.
   */
  private async computeAggregateStats(
    baseQb: SelectQueryBuilder<WorkerFeedback>,
  ): Promise<WorkerFeedbackStatsDto> {
    const rows: Array<{ stars: number | null; count: string }> = await baseQb
      .clone()
      .select('feedback.stars', 'stars')
      .addSelect('COUNT(*)', 'count')
      .groupBy('feedback.stars')
      .getRawMany();

    const stats = this.emptyStats();
    let total = 0;
    let weighted = 0;
    for (const row of rows) {
      const stars = row.stars == null ? null : Number(row.stars);
      const count = Number(row.count);
      if (stars === null) continue;
      total += count;
      weighted += stars * count;
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
    stats.totalFeedbacks = total;
    stats.averageStars =
      total === 0 ? 0 : Number((weighted / total).toFixed(2));
    return stats;
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
