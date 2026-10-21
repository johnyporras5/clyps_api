import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';

/** El motivo del 403 al darle una cita nueva a un trabajador suspendido. */
export const WORKER_PLAN_SUSPENDED = 'worker_plan_suspended';

/**
 * Ningún servicio NUEVO para un trabajador suspendido por el plan.
 *
 * Va en un subscriber y no en cada método porque las citas nacen por varios
 * caminos (admin, trabajador, cliente final, reserva pública, agregar un
 * servicio a una cita) y basta con olvidar uno para que el suspendido siga
 * recibiendo clientes. Dentro de la transacción del alta, el error deshace la
 * cita entera.
 *
 * Lo que NO corta, a propósito: todo lo que le pasa a una cita que YA tenía
 * —cambiarle el estatus, cobrarla, cancelarla, reagendarla con él—. Esas
 * siguen su curso normal.
 *
 * Cubre:
 * - insertar un detalle con un suspendido;
 * - `save()` de un detalle existente que CAMBIA a un suspendido.
 * Los UPDATE por QueryBuilder no traen el valor anterior y no se pueden
 * distinguir de "lo dejó igual": la reasignación, que va por ahí, lo revisa
 * ella misma (`SessionService.assignWorkersToSession`).
 *
 * Se registra por DI (push a dataSource.subscribers), igual que
 * SessionSubscriber.
 */
@Injectable()
export class SessionDetailSubscriber implements EntitySubscriberInterface<SessionDetail> {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return SessionDetail;
  }

  async beforeInsert(event: InsertEvent<SessionDetail>): Promise<void> {
    await assertWorkerCanTakeNewAppointments(
      event.manager,
      event.entity?.companyWorkerId,
    );
  }

  async beforeUpdate(event: UpdateEvent<SessionDetail>): Promise<void> {
    const before = event.databaseEntity;
    const after = event.entity as Partial<SessionDetail> | undefined;
    if (!before || !after || after.companyWorkerId === undefined) return;
    if (Number(after.companyWorkerId) === Number(before.companyWorkerId))
      return;
    await assertWorkerCanTakeNewAppointments(
      event.manager,
      after.companyWorkerId,
    );
  }
}

/**
 * Corta si el trabajador está suspendido por el plan. Sin trabajador (cita a
 * nivel salón) no hay nada que revisar.
 */
export async function assertWorkerCanTakeNewAppointments(
  manager: EntityManager,
  companyWorkerId: number | null | undefined,
): Promise<void> {
  if (companyWorkerId === null || companyWorkerId === undefined) return;

  const worker = await manager.findOne(CompanyWorker, {
    where: { id: Number(companyWorkerId) },
    select: { id: true, planSuspended: true },
  });
  if (!worker?.planSuspended) return;

  throw new ForbiddenException({
    message:
      'Este trabajador está suspendido por el plan del salón y no puede recibir citas nuevas.',
    reason: WORKER_PLAN_SUSPENDED,
    companyWorkerId: worker.id,
  });
}
