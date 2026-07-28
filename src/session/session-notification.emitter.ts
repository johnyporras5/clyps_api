import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../client/entities/client.entity';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { SessionService } from './session.service';
import { SessionResponse } from './types/session-response.type';
import { NotificationService } from '../notification/notification.service';
import { buildNavigationData } from '../notification/entities/notification.entity';
import { EmailService } from '../email/email.service';

/**
 * Crea notificaciones (feed + socket + FCM) para los eventos de Citas (CLYP-262 / §6).
 *
 * Es el "gemelo" de SessionRealtimeEmitter: se invoca desde el SessionController
 * en los MISMOS puntos donde se emiten los eventos socket de dominio, pero aquí
 * además persistimos una notificación por destinatario vía createNotification.
 *
 * Reglas (notas 🔴 del ticket):
 *  - Fan-out: una notificación POR destinatario.
 *  - No auto-notificar al actor: recipients = destinatarios − actor.
 *  - Best-effort: nunca rompe la mutación REST.
 *
 * Resolución de destinatarios:
 *  - admin  → company.userId
 *  - worker → companyWorker.userId (por cada companyWorkerId de los servicios)
 *  - cliente→ client.userId (desde clientId)
 */
@Injectable()
export class SessionNotificationEmitter {
  private readonly logger = new Logger(SessionNotificationEmitter.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly notifications: NotificationService,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(CompanyWorker)
    private readonly companyWorkerRepo: Repository<CompanyWorker>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly email: EmailService,
  ) {}

  // ==================== EVENTOS ====================

  /** Nueva cita agendada → admin + workers (− actor). */
  async notifyCreated(sessionId: number, actorUserId?: number): Promise<void> {
    await this.safe('appointment.created', async () => {
      const session = await this.sessionService.findOneWithDetails(sessionId);
      const { adminUserId, workerUserIds } =
        await this.resolveRecipients(session);

      const fecha = this.formatDate(session.sessionDatetime);
      await this.notifications.createNotificationForUsers(
        this.exclude([adminUserId, ...workerUserIds], actorUserId),
        {
          type: 'appointment',
          title: 'Nueva cita agendada',
          body: `Nueva cita de ${this.clientName(session)} para el ${fecha}`,
          data: buildNavigationData(
            'appointment',
            session.id,
            session.companyId,
          ),
        },
      );
    });
  }

  /** Cambio de status → cliente + admin + workers (− actor), con texto por rol. */
  async notifyStatusChanged(
    sessionId: number,
    actorUserId?: number,
  ): Promise<void> {
    await this.safe('appointment.status_changed', async () => {
      const session = await this.sessionService.findOneWithDetails(sessionId);
      const { adminUserId, workerUserIds, clientUserId } =
        await this.resolveRecipients(session);
      const estado = session.sessionStatusText;
      const data = buildNavigationData(
        'appointment',
        session.id,
        session.companyId,
      );

      // Cliente (texto propio).
      await this.notifications.createNotificationForUsers(
        this.exclude([clientUserId], actorUserId),
        {
          type: 'appointment',
          title: 'Estado de tu cita',
          body: `Tu cita en ${session.companyName} ahora está ${estado}`,
          data,
        },
      );

      // Admin + workers (texto de staff).
      await this.notifications.createNotificationForUsers(
        this.exclude([adminUserId, ...workerUserIds], actorUserId),
        {
          type: 'appointment',
          title: 'Cambio de status de cita',
          body: `La cita de ${this.clientName(session)} ahora está ${estado}`,
          data,
        },
      );
    });
  }

  /** Cita cancelada → cliente + admin + workers (− actor), con texto por rol. */
  async notifyCancelled(
    sessionId: number,
    actorUserId?: number,
  ): Promise<void> {
    await this.safe('appointment.cancelled', async () => {
      const session = await this.sessionService.findOneWithDetails(sessionId);
      const { adminUserId, workerUserIds, clientUserId } =
        await this.resolveRecipients(session);
      const fecha = this.formatDate(session.sessionDatetime);
      const data = buildNavigationData(
        'appointment',
        session.id,
        session.companyId,
      );

      // Cliente.
      await this.notifications.createNotificationForUsers(
        this.exclude([clientUserId], actorUserId),
        {
          type: 'appointment',
          title: 'Cita cancelada',
          body: `Tu cita del ${fecha} fue cancelada`,
          data,
        },
      );

      // Admin + workers.
      await this.notifications.createNotificationForUsers(
        this.exclude([adminUserId, ...workerUserIds], actorUserId),
        {
          type: 'appointment',
          title: 'Cita cancelada',
          body: `La cita de ${this.clientName(session)} del ${fecha} fue cancelada`,
          data,
        },
      );
    });
  }

  /**
   * La hora de una cita cambió por el arrastre (ripple): avisa SOLO al cliente
   * afectado, por push (feed + socket + FCM) y por correo. El correo usa la
   * misma plantilla que la confirmación, con el nuevo horario ya localizado a
   * la zona del negocio. Best-effort: nunca rompe la mutación.
   */
  async notifyRescheduled(
    sessionId: number,
    actorUserId?: number,
  ): Promise<void> {
    await this.safe('appointment.rescheduled', async () => {
      const session = await this.sessionService.findOneWithDetails(sessionId);
      const { clientUserId } = await this.resolveRecipients(session);
      const data = buildNavigationData(
        'appointment',
        session.id,
        session.companyId,
      );

      // Push al cliente (− actor).
      await this.notifications.createNotificationForUsers(
        this.exclude([clientUserId], actorUserId),
        {
          type: 'appointment',
          title: 'Tu cita cambió de hora',
          body: `La hora de tu cita en ${session.companyName} fue modificada`,
          data,
        },
      );

      // Correo al cliente (best-effort, no bloquea): mismo formato que la
      // confirmación de cita, con el nuevo horario y todos los detalles.
      const client = session.clientId
        ? await this.clientRepo.findOne({ where: { id: session.clientId } })
        : null;
      if (client?.email) {
        const [company, workerInfo] = await Promise.all([
          this.companyRepo.findOne({ where: { id: session.companyId } }),
          this.workerInfoOf(session),
        ]);
        const { date, time } = this.email.formatSessionDate(
          session.startDatetime ?? session.sessionDatetime,
        );
        // Todos los servicios de la cita en un solo correo, ordenados por hora.
        const services = [...(session.services ?? [])].sort(
          (a, b) =>
            new Date(a.startDatetime).getTime() -
            new Date(b.startDatetime).getTime(),
        );
        const emailServices = services.map((service) => ({
          name: service.serviceName,
          time: this.email.formatSessionDate(service.startDatetime).time,
          duration:
            Number(service.durationWorker) || Number(service.standardTime) || 0,
          cost:
            Number(service.appliedPrice) || Number(service.serviceCost) || 0,
          currency: service.currency ?? undefined,
          workerName: service.workerName || undefined,
        }));

        await this.email.sendSessionRescheduleToClient(
          client.email,
          this.clientName(session),
          {
            date,
            time,
            services: emailServices,
            totalCost: Number(session.totalCost) || 0,
            currency: emailServices[0]?.currency,
            totalDuration:
              Number(session.workerEstimateTime) ||
              emailServices.reduce((sum, s) => sum + s.duration, 0),
          },
          workerInfo,
          {
            name: session.companyName,
            address: session.address || company?.location || '',
            email: company?.email || '',
          },
        );
      }
    });
  }

  /**
   * El arrastre (ripple) por un cambio de servicio corrió las citas AGENDADAS
   * siguientes de un trabajador. Avisa al TRABAJADOR de esa columna y al ADMIN
   * de la compañía (− actor) que su agenda del día se movió. Los CLIENTES de
   * las citas movidas se avisan aparte con `notifyRescheduled`. Best-effort.
   */
  async notifyRippleToStaff(
    companyWorkerId: number | null | undefined,
    movedSessionIds: number[],
    actorUserId?: number,
  ): Promise<void> {
    await this.safe('appointment.ripple_staff', async () => {
      const movedCount = new Set(movedSessionIds ?? []).size;
      if (!companyWorkerId || movedCount === 0) return;

      const companyWorker = await this.companyWorkerRepo.findOne({
        where: { id: companyWorkerId },
      });
      if (!companyWorker) return;

      const [workerUserIds, adminUserId] = await Promise.all([
        this.workerUserIds([companyWorkerId]),
        this.adminUserId(companyWorker.companyId),
      ]);

      const cita =
        movedCount === 1
          ? 'la siguiente cita'
          : `las siguientes ${movedCount} citas`;

      await this.notifications.createNotificationForUsers(
        this.exclude([adminUserId, ...workerUserIds], actorUserId),
        {
          type: 'appointment',
          title: 'La agenda cambió de hora',
          body: `Un cambio de servicio corrió ${cita} de la agenda`,
          data: buildNavigationData(
            'appointment',
            movedSessionIds[0],
            companyWorker.companyId,
          ),
        },
      );
    });
  }

  /**
   * Te asignaron a una cita → SOLO el/los worker(s) recién asignados (− actor).
   * `updates` trae companyWorkerId (nuevo) y previousCompanyWorkerId.
   */
  async notifyWorkersAssigned(
    sessionId: number,
    updates: Array<{ companyWorkerId?: number | null }>,
    actorUserId?: number,
  ): Promise<void> {
    await this.safe('appointment.workers_assigned', async () => {
      const session = await this.sessionService.findOneWithDetails(sessionId);

      const newWorkerIds = [
        ...new Set(
          (updates ?? [])
            .map((u) => u.companyWorkerId)
            .filter((id): id is number => !!id),
        ),
      ];
      const userIds = await this.workerUserIds(newWorkerIds);

      await this.notifications.createNotificationForUsers(
        this.exclude(userIds, actorUserId),
        {
          type: 'assignment',
          title: 'Te asignaron a una cita',
          body: `Te asignaron a la cita de ${this.clientName(session)}`,
          data: buildNavigationData(
            'appointment',
            session.id,
            session.companyId,
          ),
        },
      );
    });
  }

  /**
   * El cliente respondió a la confirmación de asistencia → avisa a admin + workers
   * (− actor cliente). CLYP-264 (popup de asistencia).
   */
  async notifyAttendanceResponse(
    sessionId: number,
    attending: boolean,
    actorUserId?: number,
  ): Promise<void> {
    await this.safe('appointment.attendance', async () => {
      const session = await this.sessionService.findOneWithDetails(sessionId);
      const { adminUserId, workerUserIds } =
        await this.resolveRecipients(session);
      const cliente = this.clientName(session);
      await this.notifications.createNotificationForUsers(
        this.exclude([adminUserId, ...workerUserIds], actorUserId),
        {
          type: 'appointment',
          title: 'Confirmación de asistencia',
          body: attending
            ? `${cliente} confirmó su asistencia`
            : `${cliente} no asistirá a su cita`,
          data: buildNavigationData(
            'appointment',
            session.id,
            session.companyId,
          ),
        },
      );
    });
  }

  // ==================== RECORDATORIOS CRON (§7) ====================

  /** Recordatorio cliente 24h antes. */
  remindClient24h(sessionId: number): Promise<boolean> {
    return this.remind(
      sessionId,
      'reminder_client_24h',
      'client',
      (s) => `Mañana tienes una cita en ${s.companyName}`,
    );
  }

  /** Recordatorio cliente 2h antes. */
  remindClient2h(sessionId: number): Promise<boolean> {
    return this.remind(
      sessionId,
      'reminder_client_2h',
      'client',
      (s) => `Tu cita en ${s.companyName} es en 2 horas`,
    );
  }

  /** Recordatorio admin + worker 1h antes. */
  remindStaff1h(sessionId: number): Promise<boolean> {
    return this.remind(
      sessionId,
      'reminder_staff_1h',
      'staff',
      (s) => `Cita con ${this.clientName(s)} en 1 hora`,
    );
  }

  /** Recordatorio admin + worker a la hora de la cita. */
  remindStaffNow(sessionId: number): Promise<boolean> {
    return this.remind(
      sessionId,
      'reminder_staff_now',
      'staff',
      (s) => `Es hora de la cita con ${this.clientName(s)}`,
    );
  }

  /**
   * Núcleo de los recordatorios: idempotente (claim por type+sessionId) y
   * best-effort. Devuelve true si envió, false si ya estaba enviado o falló.
   */
  private async remind(
    sessionId: number,
    type: string,
    audience: 'client' | 'staff',
    bodyFn: (s: SessionResponse) => string,
  ): Promise<boolean> {
    try {
      // Idempotencia: solo el primero que reclama envía.
      const claimed = await this.notifications.claimReminder(type, sessionId);
      if (!claimed) return false;

      const session = await this.sessionService.findOneWithDetails(sessionId);
      const { adminUserId, workerUserIds, clientUserId } =
        await this.resolveRecipients(session);

      const recipients =
        audience === 'client'
          ? [clientUserId]
          : [adminUserId, ...workerUserIds];

      // Recordatorios al cliente piden confirmar asistencia: la app abre el
      // popup al ver action='confirm_attendance' (push o socket).
      const data = buildNavigationData(
        'appointment',
        session.id,
        session.companyId,
      );
      if (audience === 'client') data.action = 'confirm_attendance';

      await this.notifications.createNotificationForUsers(recipients, {
        type: 'reminder',
        title:
          audience === 'client'
            ? 'Recordatorio de tu cita'
            : 'Recordatorio de cita',
        body: bodyFn(session),
        data,
      });
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'desconocido';
      this.logger.warn(`No se pudo enviar recordatorio "${type}": ${reason}`);
      return false;
    }
  }

  // ==================== HELPERS ====================

  /** Resuelve los userId de admin, workers y cliente de una cita. */
  private async resolveRecipients(session: SessionResponse): Promise<{
    adminUserId: number | null;
    workerUserIds: number[];
    clientUserId: number | null;
  }> {
    const [adminUserId, workerUserIds, clientUserId] = await Promise.all([
      this.adminUserId(session.companyId),
      this.workerUserIds(this.companyWorkerIdsOf(session)),
      this.clientUserId(session.clientId),
    ]);
    return { adminUserId, workerUserIds, clientUserId };
  }

  private async adminUserId(companyId: number): Promise<number | null> {
    if (!companyId) return null;
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    return company?.userId ?? null;
  }

  private async workerUserIds(companyWorkerIds: number[]): Promise<number[]> {
    if (companyWorkerIds.length === 0) return [];
    const rows = await this.companyWorkerRepo.find({
      where: companyWorkerIds.map((id) => ({ id })),
    });
    return rows
      .map((r) => r.userId)
      .filter((id): id is number => id !== null && id !== undefined);
  }

  private async clientUserId(clientId: number): Promise<number | null> {
    if (!clientId) return null;
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    return client?.userId ?? null;
  }

  private companyWorkerIdsOf(session: SessionResponse): number[] {
    const ids = new Set<number>();
    for (const s of session.services ?? []) {
      if (s.companyWorkerId) ids.add(s.companyWorkerId);
    }
    return [...ids];
  }

  /**
   * Profesional a mostrar en el correo: si la cita tiene varios, se listan los
   * nombres y no se muestra teléfono (no hay uno solo al que llamar).
   */
  private async workerInfoOf(
    session: SessionResponse,
  ): Promise<{ name: string; phone?: string }> {
    const names = [
      ...new Set(
        (session.services ?? [])
          .map((s) => (s.workerName || '').trim())
          .filter(Boolean),
      ),
    ];
    const name = names.join(', ') || 'Profesional';

    const companyWorkerIds = this.companyWorkerIdsOf(session);
    if (companyWorkerIds.length !== 1) return { name };

    const companyWorker = await this.companyWorkerRepo.findOne({
      where: { id: companyWorkerIds[0] },
      relations: ['worker'],
    });
    return { name, phone: companyWorker?.worker?.phone || undefined };
  }

  private clientName(session: SessionResponse): string {
    return (
      [session.clientName, session.clientLastName].filter(Boolean).join(' ') ||
      'un cliente'
    );
  }

  /** Quita el actor (y nulos) de la lista de destinatarios. */
  private exclude(
    userIds: Array<number | null | undefined>,
    actorUserId?: number,
  ): number[] {
    return userIds.filter((id): id is number => !!id && id !== actorUserId);
  }

  /** Fecha legible en español (ej. "12 jun"). Usa UTC (las fechas llegan en Z). */
  private formatDate(value: Date | string): string {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const meses = [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sep',
      'oct',
      'nov',
      'dic',
    ];
    return `${d.getUTCDate()} ${meses[d.getUTCMonth()]}`;
  }

  private async safe(event: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'desconocido';
      this.logger.warn(`No se pudo notificar "${event}": ${reason}`);
    }
  }
}
