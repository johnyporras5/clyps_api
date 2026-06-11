import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../client/entities/client.entity';
import { SessionService } from './session.service';
import { SessionResponse } from './types/session-response.type';
import { RealtimeService } from '../realtime/realtime.service';
import {
  companyRoom,
  workerRoom,
  clientRoom,
  companyPublicRoom,
} from '../realtime/rooms';

/**
 * Emisor de eventos de tiempo real para Citas/Sessions (CLYP-241).
 *
 * Lo invoca el SessionController DESPUÉS de cada mutación, para no tocar la
 * lógica del SessionService. Cada método reusa `findOneWithDetails` (shape de
 * GET /sessions/:id) como "session completa" del payload.
 *
 * Regla de canal público (CLYP-240): a `company-public` SOLO se emite
 * `availability.changed` (sin datos de cliente). Los eventos `appointment.*`
 * con la session completa van únicamente a rooms privadas (company/worker/client).
 *
 * Toda emisión es best-effort: si algo falla, se loguea pero NUNCA rompe la
 * respuesta REST de la mutación.
 */
@Injectable()
export class SessionRealtimeEmitter {
  private readonly logger = new Logger(SessionRealtimeEmitter.name);

  constructor(
    private readonly realtime: RealtimeService,
    private readonly sessionService: SessionService,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  // ==================== EVENTOS ====================

  /** appointment.created → company + worker(asignados). + availability.changed. */
  async emitCreated(sessionId: number): Promise<void> {
    await this.safe('appointment.created', async () => {
      const session = await this.sessionService.findOneWithDetails(sessionId);
      const { company, workers } = await this.buildRooms(session);

      this.realtime.emitEntity([company, ...workers], {
        type: 'appointment.created',
        entityId: session.id,
        companyId: session.companyId,
        data: session,
      });

      this.emitAvailability(session);
    });
  }

  /** appointment.status_changed → company + worker + client. */
  async emitStatusChanged(sessionId: number): Promise<void> {
    await this.safe('appointment.status_changed', async () => {
      const session = await this.sessionService.findOneWithDetails(sessionId);
      const { company, workers, client } = await this.buildRooms(session);

      this.realtime.emitEntity([company, ...workers, ...client], {
        type: 'appointment.status_changed',
        entityId: session.id,
        companyId: session.companyId,
        data: session,
      });
    });
  }

  /** appointment.cancelled → company + worker + client. + availability.changed. */
  async emitCancelled(
    sessionId: number,
    cancellationReason: string | null,
    cancelledBy: string | null,
  ): Promise<void> {
    await this.safe('appointment.cancelled', async () => {
      const session = await this.sessionService.findOneWithDetails(sessionId);
      const { company, workers, client } = await this.buildRooms(session);

      this.realtime.emitEntity([company, ...workers, ...client], {
        type: 'appointment.cancelled',
        entityId: session.id,
        companyId: session.companyId,
        data: { session, cancellationReason, cancelledBy },
      });

      this.emitAvailability(session);
    });
  }

  /**
   * appointment.workers_assigned → company + worker(nuevo) + worker(previo).
   * `updates` viene de assignWorkersToSession (trae previousCompanyWorkerId y
   * companyWorkerId), permitiendo notificar a ambos trabajadores.
   */
  async emitWorkersAssigned(
    sessionId: number,
    updates: Array<{
      previousCompanyWorkerId?: number | null;
      companyWorkerId?: number | null;
    }>,
  ): Promise<void> {
    await this.safe('appointment.workers_assigned', async () => {
      const session = await this.sessionService.findOneWithDetails(sessionId);
      const { company } = await this.buildRooms(session);

      // Workers nuevos y previos (únicos, no nulos) para notificar a ambos.
      const workerIds = new Set<number>();
      for (const u of updates ?? []) {
        if (u.companyWorkerId) workerIds.add(u.companyWorkerId);
        if (u.previousCompanyWorkerId) workerIds.add(u.previousCompanyWorkerId);
      }
      const workerRooms = [...workerIds].map((id) => workerRoom(id));

      this.realtime.emitEntity([company, ...workerRooms], {
        type: 'appointment.workers_assigned',
        entityId: session.id,
        companyId: session.companyId,
        data: { session, updates },
      });
    });
  }

  /** appointment.extra_services_changed → company + worker + client. */
  async emitExtraServicesChanged(
    sessionId: number,
    newTotals?: { totalCost: number; totalTime: number },
  ): Promise<void> {
    await this.safe('appointment.extra_services_changed', async () => {
      const session = await this.sessionService.findOneWithDetails(sessionId);
      const { company, workers, client } = await this.buildRooms(session);

      this.realtime.emitEntity([company, ...workers, ...client], {
        type: 'appointment.extra_services_changed',
        entityId: session.id,
        companyId: session.companyId,
        data: {
          session,
          newTotals: newTotals ?? {
            totalCost: session.totalCost,
            totalTime: session.workerEstimateTime,
          },
        },
      });
    });
  }

  // ==================== HELPERS ====================

  /**
   * availability.changed → SOLO company-public. Sin datos de cliente: avisa que
   * cambió la disponibilidad de una fecha/empresa (evita doble reserva).
   */
  private emitAvailability(session: SessionResponse): void {
    if (!session.companyId) return;
    const date = this.toDateString(session.sessionDatetime);
    const companyWorkerIds = this.workerIdsOf(session);

    this.realtime.emitEntity(companyPublicRoom(session.companyId), {
      type: 'availability.changed',
      entityId: session.companyId,
      companyId: session.companyId,
      data: { companyId: session.companyId, date, companyWorkerIds },
    });
  }

  /** Construye las rooms privadas de una session a partir de su shape de GET. */
  private async buildRooms(session: SessionResponse): Promise<{
    company: string;
    workers: string[];
    client: string[];
  }> {
    const company = companyRoom(session.companyId);
    const workers = this.workerIdsOf(session).map((id) => workerRoom(id));

    // client:<userId> — resolvemos el userId del cliente desde su clientId.
    let client: string[] = [];
    const clientRow = await this.clientRepository.findOne({
      where: { id: session.clientId },
    });
    if (clientRow?.userId) {
      client = [clientRoom(clientRow.userId)];
    }

    return { company, workers, client };
  }

  /** companyWorkerId únicos (no nulos) de los servicios de la session. */
  private workerIdsOf(session: SessionResponse): number[] {
    const ids = new Set<number>();
    for (const s of session.services ?? []) {
      if (s.companyWorkerId) ids.add(s.companyWorkerId);
    }
    return [...ids];
  }

  /** Normaliza la fecha de la cita a 'YYYY-MM-DD'. */
  private toDateString(value: Date | string): string {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toISOString().split('T')[0];
  }

  /** Ejecuta la emisión protegida: nunca propaga errores a la mutación REST. */
  private async safe(event: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'desconocido';
      this.logger.warn(`No se pudo emitir "${event}": ${reason}`);
    }
  }
}
