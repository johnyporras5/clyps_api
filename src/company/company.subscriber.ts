import { Injectable } from '@nestjs/common';
import { DataSource, EntitySubscriberInterface, InsertEvent } from 'typeorm';
import { Company } from './entities/company.entity';
import { generateUniqueCompanySlug } from './company-slug.util';

/**
 * Asigna el `slug` (enlace público de reservas) a cada compañía ANTES de
 * insertarla. Va en un subscriber porque hay varios puntos de alta (registro
 * de admin, POST /companys…) y así ninguna compañía queda sin enlace.
 *
 * Se registra por DI (push a dataSource.subscribers) — sin @EventSubscriber
 * para no duplicar el disparo. Mismo patrón que SessionSubscriber.
 */
@Injectable()
export class CompanySubscriber implements EntitySubscriberInterface<Company> {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return Company;
  }

  async beforeInsert(event: InsertEvent<Company>): Promise<void> {
    const entity = event.entity;
    if (!entity || entity.slug) return;
    entity.slug = await generateUniqueCompanySlug(event.manager, entity.name);
  }
}
