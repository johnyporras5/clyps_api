import { Injectable } from '@nestjs/common';
import { DataSource, EntitySubscriberInterface, InsertEvent } from 'typeorm';
import { Worker } from '../worker/entities/worker.entity';
import { CompanyWorker } from './entities/company_worker.entity';
import { generateUniqueWorkerSlug } from './company-worker-slug.util';

/**
 * Asigna el `slug` (enlace de reservas del profesional) a cada company_worker
 * ANTES de insertarlo. Hay varios puntos de alta (registro de trabajador por el
 * admin, onboarding del equipo…), así ninguno queda sin enlace.
 *
 * Se registra por DI (push a dataSource.subscribers), igual que
 * SessionSubscriber y CompanySubscriber.
 */
@Injectable()
export class CompanyWorkerSubscriber implements EntitySubscriberInterface<CompanyWorker> {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return CompanyWorker;
  }

  async beforeInsert(event: InsertEvent<CompanyWorker>): Promise<void> {
    const entity = event.entity;
    if (!entity || entity.slug || !entity.companyId) return;

    const name =
      entity.worker?.name ??
      (entity.workerId
        ? (
            await event.manager.findOne(Worker, {
              where: { id: entity.workerId },
              select: { id: true, name: true },
            })
          )?.name
        : null);

    entity.slug = await generateUniqueWorkerSlug(
      event.manager,
      entity.companyId,
      name,
    );
  }
}
