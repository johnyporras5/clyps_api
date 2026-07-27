import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Session } from '../session/entities/session.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { CompanyFeedback } from '../company_feedback/entities/company_feedback.entity';
import { WorkerFeedback } from '../worker_feedback/entities/worker_feedback.entity';
import { Client } from '../client/entities/client.entity';
import { FileUploadService } from '../common/services/file_upload.service';

// OJO con dos identidades distintas del cliente:
//  - userId  = req.user.sub = feedback.client_id (así se guardan las reseñas).
//  - clientId (entidad) = session.client_id.
// Las reseñas se filtran por userId; las sesiones por el client.id.

export type FeedbackStatus = 'pending' | 'partial' | 'completed' | 'skipped';

// Objeto `feedback` aditivo de B1.
export interface SessionFeedback {
  status: FeedbackStatus;
  companyRated: boolean;
  ratedCompanyWorkerIds: number[];
  pendingCompanyWorkerIds: number[];
  skippedAt: Date | null;
}

@Injectable()
export class FeedbacksService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(SessionDetail)
    private readonly detailRepo: Repository<SessionDetail>,
    @InjectRepository(CompanyFeedback)
    private readonly companyFbRepo: Repository<CompanyFeedback>,
    @InjectRepository(WorkerFeedback)
    private readonly workerFbRepo: Repository<WorkerFeedback>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly fileUpload: FileUploadService,
  ) {}

  /** client.id (entidad, clave de session.client_id) a partir del userId. */
  private async resolveClientEntityId(userId: number): Promise<number | null> {
    const client = await this.clientRepo.findOne({
      where: { userId },
      select: ['id'],
    });
    return client?.id ?? null;
  }

  /**
   * B1: estado de calificación de varias citas para un cliente, en pocas
   * consultas (batch). `status` completed = negocio + TODOS los trabajadores no
   * cancelados calificados. Los ids son companyWorkerId.
   */
  async getFeedbackForSessions(
    clientId: number,
    sessionIds: number[],
  ): Promise<Map<number, SessionFeedback>> {
    const map = new Map<number, SessionFeedback>();
    if (sessionIds.length === 0) return map;

    const [sessions, details, companyFbs, workerFbs] = await Promise.all([
      this.sessionRepo.find({
        where: { id: In(sessionIds) },
        select: ['id', 'feedbackSkippedAt'],
      }),
      this.detailRepo.find({
        where: { sessionId: In(sessionIds) },
        select: ['sessionId', 'companyWorkerId', 'status'],
      }),
      this.companyFbRepo.find({
        where: { clientId, sessionId: In(sessionIds) },
        select: ['sessionId'],
      }),
      this.workerFbRepo.find({
        where: { clientId, sessionId: In(sessionIds) },
        select: ['sessionId', 'companyWorkerId'],
      }),
    ]);

    const skippedBy = new Map<number, Date | null>(
      sessions.map((s) => [s.id, s.feedbackSkippedAt ?? null]),
    );
    const companyRated = new Set(companyFbs.map((f) => f.sessionId));

    // Trabajadores que atendieron (detalles no cancelados), por cita.
    const workersBy = new Map<number, Set<number>>();
    for (const d of details) {
      if (d.status === 5 || d.companyWorkerId == null) continue;
      if (!workersBy.has(d.sessionId)) workersBy.set(d.sessionId, new Set());
      workersBy.get(d.sessionId)!.add(d.companyWorkerId);
    }

    // companyWorkerIds ya calificados, por cita.
    const ratedBy = new Map<number, Set<number>>();
    for (const f of workerFbs) {
      if (f.companyWorkerId == null || f.sessionId == null) continue;
      if (!ratedBy.has(f.sessionId)) ratedBy.set(f.sessionId, new Set());
      ratedBy.get(f.sessionId)!.add(f.companyWorkerId);
    }

    for (const sid of sessionIds) {
      const workers = [...(workersBy.get(sid) ?? [])];
      const rated = ratedBy.get(sid) ?? new Set<number>();
      const ratedCompanyWorkerIds = workers.filter((id) => rated.has(id));
      const pendingCompanyWorkerIds = workers.filter((id) => !rated.has(id));
      const companyIsRated = companyRated.has(sid);
      const skippedAt = skippedBy.get(sid) ?? null;

      let status: FeedbackStatus;
      if (skippedAt) status = 'skipped';
      else if (companyIsRated && pendingCompanyWorkerIds.length === 0)
        status = 'completed';
      else if (companyIsRated || ratedCompanyWorkerIds.length > 0)
        status = 'partial';
      else status = 'pending';

      map.set(sid, {
        status,
        companyRated: companyIsRated,
        ratedCompanyWorkerIds,
        pendingCompanyWorkerIds,
        skippedAt,
      });
    }
    return map;
  }

  /** B1 para una sola cita. */
  async getSessionFeedback(
    clientId: number,
    sessionId: number,
  ): Promise<SessionFeedback> {
    const map = await this.getFeedbackForSessions(clientId, [sessionId]);
    return (
      map.get(sessionId) ?? {
        status: 'pending',
        companyRated: false,
        ratedCompanyWorkerIds: [],
        pendingCompanyWorkerIds: [],
        skippedAt: null,
      }
    );
  }

  /**
   * B2: citas pagadas que el cliente aún puede calificar (pending/partial), ya
   * enriquecidas. Reemplaza la descarga del historial en el arranque. Más
   * antigua primero.
   */
  async getPending(userId: number, limit: number) {
    const clientEntityId = await this.resolveClientEntityId(userId);
    if (clientEntityId == null) return { data: [], meta: { total: 0 } };

    const candidates = await this.sessionRepo.find({
      // 4 = Pagada, 6 = marcada tras la 1ª reseña (puede seguir parcial).
      where: {
        clientId: clientEntityId,
        sessionStatus: In([4, 6]),
        feedbackSkippedAt: IsNull(),
      },
      order: { sessionDatetime: 'ASC' },
      select: ['id', 'sessionDatetime'],
    });

    const fbMap = await this.getFeedbackForSessions(
      userId,
      candidates.map((s) => s.id),
    );
    // Solo citas SIN ninguna reseña. Calificar una cosa (negocio o un worker)
    // ya cierra la cita y la saca de pending; partial/completed/skipped quedan
    // fuera. Así el skip nunca cae sobre una cita que ya tiene reseñas.
    const pending = candidates.filter(
      (s) => fbMap.get(s.id)?.status === 'pending',
    );

    const total = pending.length;
    const page = pending.slice(0, limit);
    const data = await this.enrichPending(page, fbMap);
    return { data, meta: { total } };
  }

  private async enrichPending(
    sessions: Array<Pick<Session, 'id' | 'sessionDatetime'>>,
    fbMap: Map<number, SessionFeedback>,
  ) {
    if (sessions.length === 0) return [];
    const ids = sessions.map((s) => s.id);

    const rows: Array<{
      sessionId: number;
      companyWorkerId: number;
      workerName: string | null;
      workerPicture: string | null;
      serviceName: string | null;
      companyId: number | null;
      companyName: string | null;
      companyLogo: string | null;
    }> = await this.detailRepo.query(
      `SELECT sd.session_id AS sessionId, sd.company_worker_id AS companyWorkerId,
              w.name AS workerName, w.picture AS workerPicture,
              s.name AS serviceName,
              cw.company_id AS companyId, co.name AS companyName, co.logo AS companyLogo
         FROM session_detail sd
         JOIN company_worker cw ON cw.id = sd.company_worker_id
         LEFT JOIN worker w ON w.id = cw.worker_id
         LEFT JOIN service s ON s.id = sd.service_id
         LEFT JOIN company co ON co.id = cw.company_id
        WHERE sd.session_id IN (?) AND sd.status <> 5
          AND sd.company_worker_id IS NOT NULL`,
      [ids],
    );

    const bySession = new Map<number, typeof rows>();
    for (const r of rows) {
      if (!bySession.has(r.sessionId)) bySession.set(r.sessionId, []);
      bySession.get(r.sessionId)!.push(r);
    }

    const logoUrl = (logo: string | null) =>
      logo ? this.fileUpload.getFileUrl('company_logo', logo) : null;
    const photoUrl = (pic: string | null) =>
      pic ? this.fileUpload.getFileUrl('worker_photo', pic) : null;

    return sessions.map((s) => {
      const fb = fbMap.get(s.id);
      const detailRows = bySession.get(s.id) ?? [];
      const company = detailRows[0];

      const workerMap = new Map<
        number,
        { name: string | null; picture: string | null; services: Set<string> }
      >();
      for (const r of detailRows) {
        if (!workerMap.has(r.companyWorkerId)) {
          workerMap.set(r.companyWorkerId, {
            name: r.workerName,
            picture: r.workerPicture,
            services: new Set(),
          });
        }
        if (r.serviceName) {
          workerMap.get(r.companyWorkerId)!.services.add(r.serviceName);
        }
      }

      const workers = [...workerMap.entries()].map(([companyWorkerId, w]) => ({
        companyWorkerId,
        name: (w.name || '').trim(),
        photoUrl: photoUrl(w.picture),
        serviceNames: [...w.services],
        rated: fb?.ratedCompanyWorkerIds.includes(companyWorkerId) ?? false,
      }));

      return {
        sessionId: s.id,
        sessionDatetime: s.sessionDatetime,
        company: {
          id: company?.companyId ?? null,
          name: (company?.companyName || '').trim(),
          logoUrl: logoUrl(company?.companyLogo ?? null),
          rated: fb?.companyRated ?? false,
        },
        workers,
      };
    });
  }

  /**
   * B3: el cliente declara que no calificará esa cita. Idempotente. Terminal.
   * No se puede omitir una cita que ya tiene reseñas suyas (409).
   */
  async skip(userId: number, sessionId: number): Promise<void> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }
    const clientEntityId = await this.resolveClientEntityId(userId);
    if (clientEntityId == null || session.clientId !== clientEntityId) {
      throw new ForbiddenException('Esta cita no es tuya');
    }
    if (session.feedbackSkippedAt) return; // idempotente

    const fb = await this.getSessionFeedback(userId, sessionId);
    if (fb.companyRated || fb.ratedCompanyWorkerIds.length > 0) {
      throw new ConflictException(
        'Esta cita ya tiene reseñas; no se puede marcar como omitida.',
      );
    }

    session.feedbackSkippedAt = new Date();
    await this.sessionRepo.save(session);
  }
}
