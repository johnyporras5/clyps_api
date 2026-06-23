import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { SessionNotificationEmitter } from './session-notification.emitter';
import { NotificationService } from '../notification/notification.service';
import { buildNavigationData } from '../notification/entities/notification.entity';

/**
 * Jobs cron de recordatorios de citas + reenganche (CLYP-263 / §7).
 *
 * Cada job busca citas en una VENTANA temporal y delega el envío (idempotente)
 * al SessionNotificationEmitter. Las fechas se guardan en UTC; comparamos
 * UTC-contra-UTC, que es consistente.
 *
 * Estados de cita considerados "vigentes" para recordar: agendada (1) / en
 * proceso (2). Se excluyen completada/pagada/cancelada/calificada (3,4,5,6).
 */
@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private static readonly ACTIVE_STATUSES = [1, 2];

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    private readonly dataSource: DataSource,
    private readonly emitter: SessionNotificationEmitter,
    private readonly notifications: NotificationService,
  ) {}

  // ==================== RECORDATORIOS DE CITA ====================

  /** Cliente, 24h antes. Ventana [ahora+24h, ahora+25h). */
  @Cron(CronExpression.EVERY_HOUR)
  async clientReminder24h(): Promise<void> {
    const ids = await this.sessionsStartingIn(24 * 60, 60);
    for (const id of ids) await this.emitter.remindClient24h(id);
  }

  /** Cliente, 2h antes. Ventana [ahora+2h, ahora+2h30m). */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async clientReminder2h(): Promise<void> {
    const ids = await this.sessionsStartingIn(120, 30);
    for (const id of ids) await this.emitter.remindClient2h(id);
  }

  /** Admin + worker, 1h antes. Ventana [ahora+1h, ahora+1h30m). */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async staffReminder1h(): Promise<void> {
    const ids = await this.sessionsStartingIn(60, 30);
    for (const id of ids) await this.emitter.remindStaff1h(id);
  }

  /** Admin + worker, a la hora. Ventana [ahora, ahora+10m). */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async staffReminderNow(): Promise<void> {
    const ids = await this.sessionsStartingIn(0, 10);
    for (const id of ids) await this.emitter.remindStaffNow(id);
  }

  // ==================== 1 MES SIN CITAS ====================

  /**
   * Clientes sin citas en ≥30 días → "¡Te extrañamos!". Recurrente: se puede
   * repetir como máximo una vez cada 30 días mientras el cliente siga inactivo.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async inactiveClientsReminder(): Promise<void> {
    try {
      const rows: Array<{ clientId: number; uid: number }> =
        await this.dataSource.query(
          `SELECT cl.id AS clientId, cl.user_id AS uid
             FROM client cl
             JOIN session s ON s.client_id = cl.id
            WHERE cl.user_id IS NOT NULL
            GROUP BY cl.id, cl.user_id
           HAVING MAX(s.session_datetime) < (NOW() - INTERVAL 30 DAY)`,
        );

      for (const r of rows) {
        // Recurrente: puede repetirse si el cliente sigue inactivo (cada 30 días).
        const claimed = await this.notifications.claimRecurringReminder(
          'no_appointments_30d',
          r.clientId,
          30,
        );
        if (!claimed) continue;
        await this.notifications.createNotification(r.uid, {
          type: 'system',
          title: '¡Te extrañamos!',
          body: 'Agenda tu próxima cita',
          data: buildNavigationData('system'),
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'desconocido';
      this.logger.warn(`Job inactiveClientsReminder falló: ${reason}`);
    }
  }

  // ==================== HELPERS ====================

  /**
   * Ids de citas vigentes cuyo inicio cae en [ahora+offsetMin, +widthMin).
   *
   * La comparación se hace en SQL con UTC_TIMESTAMP() (UTC-contra-UTC): las
   * citas se guardan en UTC, así evitamos la conversión de zona horaria del
   * driver mysql2 (que asumiría tz local). Expuesto para pruebas controladas.
   */
  async sessionsStartingIn(
    offsetMinutes: number,
    widthMinutes: number,
  ): Promise<number[]> {
    const rows: Array<{ id: number }> = await this.sessionRepo.query(
      `SELECT id FROM session
        WHERE session_status IN (?, ?)
          AND session_datetime >= DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
          AND session_datetime <  DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)`,
      [
        ReminderSchedulerService.ACTIVE_STATUSES[0],
        ReminderSchedulerService.ACTIVE_STATUSES[1],
        offsetMinutes,
        offsetMinutes + widthMinutes,
      ],
    );
    return rows.map((r) => r.id);
  }
}
