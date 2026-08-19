import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  EntitySubscriberInterface,
  InsertEvent,
} from 'typeorm';
import { Session } from './entities/session.entity';
import { generateSessionCode } from './session-code.util';

/**
 * Asigna el `publicCode` (código visual) a cada sesión ANTES de insertarla.
 * Se hace en un subscriber en vez de en cada método de creación porque hay
 * varios puntos de alta (admin, cliente, create-with-detail…). El subscriber
 * se dispara en cualquier insert (repository/manager/queryRunner), así ninguna
 * cita queda sin código. La unicidad se asegura reintentando contra la BD.
 *
 * Se registra por DI (push a dataSource.subscribers) — sin @EventSubscriber
 * para no duplicar el disparo.
 */
@Injectable()
export class SessionSubscriber implements EntitySubscriberInterface<Session> {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return Session;
  }

  async beforeInsert(event: InsertEvent<Session>): Promise<void> {
    const entity = event.entity;
    if (!entity || entity.publicCode) return;
    entity.publicCode = await this.generateUniqueCode(event.manager);
  }

  private async generateUniqueCode(manager: EntityManager): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateSessionCode();
      const existing = await manager.findOne(Session, {
        where: { publicCode: code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    // Fallback ante colisiones repetidas (prácticamente inalcanzable con ~1e9
    // combinaciones): un código más largo. `CIT-` + 10 = 14 chars (cabe en 16).
    return generateSessionCode(10);
  }
}
