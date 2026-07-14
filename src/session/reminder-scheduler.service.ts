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

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async clientBirthdayReminder(): Promise<void> {
    try {
      const clients: Array<{
        id: number;
        name: string | null;
        lastName: string | null;
        createdByCompanyWorkerId: number | null;
      }> = await this.dataSource.query(
        `SELECT id,
                name,
                last_name AS lastName,
                created_by_company_worker_id AS createdByCompanyWorkerId
           FROM client
          WHERE birth_date IS NOT NULL
            AND is_active = 1
            AND (
                  -- Cumpleaños normal: coinciden mes y día.
                  (MONTH(birth_date) = MONTH(CURDATE())
                   AND DAY(birth_date) = DAY(CURDATE()))

                  -- Nacidos un 29 de febrero: en los años NO bisiestos ese día
                  -- no existe, así que se felicita el 28. LAST_DAY del febrero
                  -- en curso vale 28 si el año no es bisiesto; si lo es, vale 29
                  -- y esos clientes ya entran por la condición normal (sin
                  -- duplicarse, porque entonces esta rama no se cumple).
               OR (MONTH(birth_date) = 2 AND DAY(birth_date) = 29
                   AND MONTH(CURDATE()) = 2 AND DAY(CURDATE()) = 28
                   AND DAY(LAST_DAY(CONCAT(YEAR(CURDATE()), '-02-01'))) = 28)
                )`,
      );

      for (const client of clients) {
        const claimed = await this.notifications.claimRecurringReminder(
          'client_birthday',
          client.id,
          300,
        );
        if (!claimed) continue;

        const recipients = await this.birthdayRecipients(
          client.id,
          client.createdByCompanyWorkerId,
        );
        if (recipients.length === 0) continue;

        const fullName =
          [client.name, client.lastName]
            .map((part) => (part ?? '').trim())
            .filter(Boolean)
            .join(' ') || 'Un cliente';

        await this.notifications.createNotificationForUsers(recipients, {
          type: 'system',
          title: '🎂 ¡Hoy es su cumpleaños!',
          body: `${fullName} cumple años hoy. Aprovecha para felicitarlo.`,
          data: buildNavigationData('system'),
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'desconocido';
      this.logger.warn(`Job clientBirthdayReminder falló: ${reason}`);
    }
  }

  private async birthdayRecipients(
    clientId: number,
    createdByCompanyWorkerId: number | null,
  ): Promise<number[]> {
    const admins: Array<{ uid: number }> = await this.dataSource.query(
      `SELECT DISTINCT co.user_id AS uid
         FROM company co
         JOIN client cl ON cl.id = ?
        WHERE co.user_id IS NOT NULL
          AND JSON_CONTAINS(COALESCE(cl.companies, JSON_ARRAY()), CAST(co.id AS JSON))`,
      [clientId],
    );

    const workers: Array<{ uid: number }> = await this.dataSource.query(
      `SELECT DISTINCT cw.user_id AS uid
         FROM company_worker cw
        WHERE cw.is_active = 1
          AND cw.user_id IS NOT NULL
          AND (
                cw.id = ?
             OR EXISTS (
                  SELECT 1
                    FROM session_detail d
                    JOIN session s ON s.id = d.session_id
                   WHERE d.company_worker_id = cw.id
                     AND s.client_id = ?
                )
          )`,
      [createdByCompanyWorkerId ?? 0, clientId],
    );

    return [...admins, ...workers].map((r) => Number(r.uid));
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
