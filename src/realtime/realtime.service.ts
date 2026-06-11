import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

/**
 * Contrato global de evento de tiempo real (CLYP-240).
 * Cada mutación emite el objeto COMPLETO (no solo el id), reusando el shape
 * del GET correspondiente, envuelto en esta estructura.
 */
export interface RealtimeEvent<T = unknown> {
  /** Tipo de evento, ej. 'session.updated', 'offer.expired'. */
  type: string;
  /** Id de la entidad afectada. */
  entityId: number | string;
  /** Empresa dueña del evento (para trazabilidad/filtrado en cliente). */
  companyId: number | string | null;
  /** ISO timestamp de emisión. */
  emittedAt: string;
  /** Objeto completo (shape del GET). */
  data: T;
}

/**
 * Punto de emisión CENTRAL de WebSockets. Los services de dominio
 * (citas, reseñas, ofertas, etc.) inyectan ESTE service —no el Gateway—
 * para evitar dependencias circulares.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  /** El Gateway registra aquí el server de socket.io al inicializarse. */
  setServer(server: Server): void {
    this.server = server;
  }

  /**
   * Emite `event` con `payload` a una o varias rooms.
   * No-op seguro si el server aún no está listo (no rompe la mutación REST).
   */
  emitToRooms(
    rooms: string | string[],
    event: string,
    payload: RealtimeEvent | unknown,
  ): void {
    if (!this.server) {
      this.logger.warn(
        `Server de WebSockets no inicializado; se omite emisión de "${event}"`,
      );
      return;
    }

    const targetRooms = Array.isArray(rooms) ? rooms : [rooms];
    if (targetRooms.length === 0) return;

    this.server.to(targetRooms).emit(event, payload);
  }

  /**
   * Helper de conveniencia: arma el sobre {type, entityId, companyId,
   * emittedAt, data} y lo emite. `emittedAt` se setea aquí con la hora actual.
   */
  emitEntity(
    rooms: string | string[],
    params: {
      type: string;
      entityId: number | string;
      companyId: number | string | null;
      data: unknown;
    },
  ): void {
    const payload: RealtimeEvent = {
      type: params.type,
      entityId: params.entityId,
      companyId: params.companyId,
      emittedAt: new Date().toISOString(),
      data: params.data,
    };
    this.emitToRooms(rooms, params.type, payload);
  }
}
