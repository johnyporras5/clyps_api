import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { NotificationService } from '../notification/notification.service';
import { buildNavigationData } from '../notification/entities/notification.entity';

/**
 * Notificación "Te asignaron un nuevo servicio" (CLYP-264 / §6 pendiente).
 *
 * Se dispara cuando un worker (companyWorkerId) se AGREGA a `service.workers`
 * al crear/actualizar un servicio. Notifica solo a los workers recién añadidos.
 * Best-effort: nunca rompe la mutación del servicio.
 */
@Injectable()
export class ServiceNotificationEmitter {
  private readonly logger = new Logger(ServiceNotificationEmitter.name);

  constructor(
    private readonly notifications: NotificationService,
    @InjectRepository(CompanyWorker)
    private readonly companyWorkerRepo: Repository<CompanyWorker>,
  ) {}

  /** Notifica a los workers recién asignados a un servicio. */
  async notifyAssigned(
    serviceId: number,
    serviceName: string,
    addedCompanyWorkerIds: number[],
    actorUserId?: number,
  ): Promise<void> {
    try {
      const ids = [...new Set(addedCompanyWorkerIds.filter(Boolean))];
      if (ids.length === 0) return;

      const rows = await this.companyWorkerRepo.find({
        where: ids.map((id) => ({ id })),
      });
      const userIds = rows
        .map((r) => r.userId)
        .filter((id): id is number => !!id && id !== actorUserId);

      await this.notifications.createNotificationForUsers(userIds, {
        type: 'assignment',
        title: 'Nuevo servicio asignado',
        body: `Te asignaron el servicio ${serviceName}`,
        data: buildNavigationData('assignment', serviceId),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'desconocido';
      this.logger.warn(
        `No se pudo notificar asignación de servicio: ${reason}`,
      );
    }
  }
}
