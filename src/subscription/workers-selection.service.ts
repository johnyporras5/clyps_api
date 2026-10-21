import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { FileUploadService } from '../common/services/file_upload.service';
import { getPlan, type PlanId } from './config/plans.config';
import { EntitlementsService } from './entitlements.service';
import {
  SUBSCRIPTION_ACTIVATED,
  type SubscriptionActivatedEvent,
} from './subscription.service';
import type { WorkersSelectionResponse } from './dto/workers-selection-response.dto';

/** Estatus de cita que todavía no ocurrió: agendada (1) y en proceso (2). */
const PENDING_STATUSES = [1, 2];

/** El único plan cuyo pago devuelve a los suspendidos. */
const FULL_PLAN_ID: PlanId = 'full';

/** Trabajador que hoy puede recibir citas (sin contar el tope). */
const BOOKABLE = {
  isActive: 1,
  temporarilyDeleted: false,
  permanentlyDeleted: false,
} as const;

/**
 * Con qué trabajadores se queda un salón que tiene más de los que admite su
 * plan.
 *
 * Al terminar la prueba (o al renovar bajando de plan) un salón con 5
 * trabajadores que compró el Básico (tope 2) queda bloqueado hasta que escoja
 * 2. Los otros 3 quedan `planSuspended`: no se borran, conservan su historial,
 * su cuenta y sus citas ya agendadas, pero no reciben citas nuevas. Vuelven
 * solos cuando el salón paga el Full.
 *
 * El "cuándo hay que escoger" NO vive aquí: lo decide `EntitlementsService`,
 * que es la única puerta de acceso. Esto solo lista, guarda la elección y
 * devuelve a los suspendidos.
 */
@Injectable()
export class WorkersSelectionService {
  private readonly logger = new Logger(WorkersSelectionService.name);
  private readonly WORKER_PHOTO_FOLDER = 'worker_photo';

  constructor(
    @InjectRepository(CompanyWorker)
    private readonly workers: Repository<CompanyWorker>,
    private readonly entitlements: EntitlementsService,
    private readonly files: FileUploadService,
  ) {}

  /**
   * Lo que pinta la pantalla de selección: cuántos puede conservar y entre
   * quiénes elige, con sus citas pendientes para que decida sabiendo a quién
   * le quedan clientes agendados.
   */
  async getSelection(companyId: number): Promise<WorkersSelectionResponse> {
    const access = await this.entitlements.getAccessResponse(companyId);
    const candidates = await this.workers.find({
      where: { companyId, ...BOOKABLE, planSuspended: false },
      relations: ['worker'],
      order: { id: 'ASC' },
    });
    const pending = await this.pendingAppointments(
      candidates.map((cw) => cw.id),
    );

    return {
      required: access.workersSelectionRequired,
      planId: access.planId,
      planName: access.planName,
      maxWorkers: access.limits.maxWorkers,
      workers: candidates.map((cw) => ({
        companyWorkerId: cw.id,
        workerId: cw.workerId,
        fullName: cw.worker?.name ?? '',
        pictureURL: cw.worker?.picture
          ? this.files.getFileUrl(this.WORKER_PHOTO_FOLDER, cw.worker.picture)
          : '',
        pendingAppointments: pending.get(cw.id) ?? 0,
      })),
    };
  }

  /**
   * Guarda la elección: los escogidos siguen, el resto queda suspendido.
   *
   * Reglas:
   * - Solo cuando HAY que escoger. Fuera de eso no se deja: la elección es
   *   fija mientras siga en el mismo plan (lo decidió el usuario), y este
   *   endpoint sería la forma de cambiarla.
   * - Exactamente el tope del plan: la pantalla no se va hasta que escoja
   *   los dos (o los veinte).
   * - Todos tienen que ser candidatos de ESTE salón: un id ajeno o uno ya
   *   suspendido es un 400, no se ignora en silencio.
   *
   * Corre en una transacción con los candidatos bloqueados: dos envíos a la vez
   * (doble toque, dos pestañas) no pueden dejar al salón con menos trabajadores
   * de los que escogió.
   */
  async select(
    companyId: number,
    keepIds: number[],
  ): Promise<WorkersSelectionResponse> {
    const access = await this.entitlements.getAccessResponse(companyId);
    if (!access.canOperate) {
      throw new ForbiddenException(
        'Tu suscripción no está activa. Reporta tu pago antes de escoger tu equipo.',
      );
    }
    if (!access.workersSelectionRequired) {
      throw new BadRequestException(
        'Tu equipo ya cabe en tu plan: no tienes que escoger trabajadores.',
      );
    }

    const max = access.limits.maxWorkers;
    const keep = [...new Set(keepIds.map(Number))];
    if (keep.length !== keepIds.length) {
      throw new BadRequestException('Escogiste un trabajador repetido.');
    }
    if (keep.length !== max) {
      throw new BadRequestException(
        `Tu plan ${access.planName} permite ${max} trabajadores: escoge exactamente ${max}.`,
      );
    }

    const suspended = await this.workers.manager.transaction(
      async (manager) => {
        const candidates = await manager.find(CompanyWorker, {
          where: { companyId, ...BOOKABLE, planSuspended: false },
          lock: { mode: 'pessimistic_write' },
        });
        const candidateIds = new Set(candidates.map((cw) => cw.id));

        // Rechequeo dentro del candado: la otra petición pudo haber guardado
        // su elección mientras esta esperaba.
        if (candidates.length <= max) {
          throw new BadRequestException(
            'Tu equipo ya cabe en tu plan: no tienes que escoger trabajadores.',
          );
        }
        if (keep.some((id) => !candidateIds.has(id))) {
          throw new BadRequestException(
            'Uno de los trabajadores escogidos no pertenece a tu salón o ya no está activo.',
          );
        }

        const toSuspend = candidates
          .filter((cw) => !keep.includes(cw.id))
          .map((cw) => cw.id);
        await manager.update(
          CompanyWorker,
          { id: In(toSuspend) },
          { planSuspended: true },
        );
        return toSuspend;
      },
    );

    this.logger.log(
      `La company ${companyId} se quedó con [${keep.join(', ')}] y suspendió [${suspended.join(', ')}] por el plan.`,
    );
    this.entitlements.invalidate(companyId);
    return this.getSelection(companyId);
  }

  /**
   * Devuelve a los suspendidos cuando el plan vuelve a tener lugar para ellos.
   *
   * Se llama al verificarse un pago. Pagar el Full los trae solos (hasta 20);
   * renovar el Básico no trae a nadie, AUNQUE haya lugar: si el dueño borró a
   * uno de sus 2 escogidos, el hueco no se llena con un suspendido —la regla
   * es que vuelven pagando el Full, no esperando una renovación—. Si hay más
   * suspendidos que lugares —un salón de 25 que pasa a Full— vuelven los más
   * antiguos, y el resto sigue suspendido sin pedir nada: el dueño ya escogió
   * a sus 2 originales, y esos siguen.
   *
   * Durante la prueba no corre: no puede haber suspendidos, la prueba nunca
   * pide escoger.
   *
   * Devuelve los ids reactivados.
   */
  async restoreSuspended(companyId: number): Promise<number[]> {
    this.entitlements.invalidate(companyId);
    const access = await this.entitlements.getAccessResponse(companyId);
    if (!access.canOperate || access.planId !== FULL_PLAN_ID) return [];

    const free = access.limits.maxWorkers - access.limits.workersInUse;
    if (free <= 0) return [];

    const suspended = await this.workers.find({
      where: { companyId, ...BOOKABLE, planSuspended: true },
      order: { id: 'ASC' },
      take: free,
      select: { id: true },
    });
    if (suspended.length === 0) return [];

    const ids = suspended.map((cw) => cw.id);
    await this.workers.update({ id: In(ids) }, { planSuspended: false });
    this.entitlements.invalidate(companyId);
    this.logger.log(
      `La company ${companyId} recuperó a [${ids.join(', ')}] al pasar a ${getPlan(access.planId).name}.`,
    );
    return ids;
  }

  @OnEvent(SUBSCRIPTION_ACTIVATED)
  async onActivated(event: SubscriptionActivatedEvent): Promise<void> {
    // Un fallo aquí no puede tumbar la verificación del pago, que ya se
    // guardó: se anota y el dueño lo ve como trabajadores todavía suspendidos.
    try {
      await this.restoreSuspended(event.companyId);
    } catch (error) {
      this.logger.error(
        `No se pudo reactivar a los suspendidos de la company ${event.companyId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Citas por venir de cada trabajador, de una sola consulta. */
  private async pendingAppointments(
    companyWorkerIds: number[],
  ): Promise<Map<number, number>> {
    if (companyWorkerIds.length === 0) return new Map();
    const rows = await this.workers.manager
      .getRepository(SessionDetail)
      .createQueryBuilder('detail')
      .select('detail.company_worker_id', 'companyWorkerId')
      .addSelect('COUNT(DISTINCT detail.session_id)', 'total')
      .where('detail.company_worker_id IN (:...ids)', { ids: companyWorkerIds })
      .andWhere('detail.status IN (:...statuses)', {
        statuses: PENDING_STATUSES,
      })
      .andWhere('detail.start_datetime >= :now', { now: new Date() })
      .groupBy('detail.company_worker_id')
      .getRawMany<{ companyWorkerId: number; total: string }>();

    return new Map(
      rows.map((r) => [Number(r.companyWorkerId), Number(r.total)]),
    );
  }
}
