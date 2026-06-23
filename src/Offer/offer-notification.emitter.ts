import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Company } from '../company/entities/company.entity';
import { Offer } from './entities/offer.entity';
import { NotificationService } from '../notification/notification.service';
import { buildNavigationData } from '../notification/entities/notification.entity';

/**
 * Notificaciones de ofertas (CLYP-262 / §6).
 *
 * "Nueva oferta" (offer.created) va SOLO a los clientes que han tenido al menos
 * una cita con esa company (decisión de producto, no a todos los clientes).
 *
 * Best-effort: nunca rompe la mutación de la oferta.
 */
@Injectable()
export class OfferNotificationEmitter {
  private readonly logger = new Logger(OfferNotificationEmitter.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly dataSource: DataSource,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Offer)
    private readonly offerRepo: Repository<Offer>,
  ) {}

  /** Nueva oferta → clientes con cita previa en la company. */
  async notifyCreated(offer: {
    id: number;
    companyId: number;
    name: string;
  }): Promise<void> {
    try {
      const [userIds, companyName] = await Promise.all([
        this.clientsWithAppointments(offer.companyId),
        this.companyName(offer.companyId),
      ]);
      if (userIds.length === 0) return;

      await this.notifications.createNotificationForUsers(userIds, {
        type: 'offer',
        title: 'Nueva oferta',
        body: `Nueva oferta en ${companyName}: ${offer.name}`,
        data: buildNavigationData('offer', offer.id, offer.companyId),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'desconocido';
      this.logger.warn(`No se pudo notificar "offer.created": ${reason}`);
    }
  }

  // ==================== CRON: OFERTA POR VENCER (§7) ====================

  /**
   * Oferta próxima a vencer → clientes con cita previa en la company + admin
   * dueño. Job diario; ofertas activas que vencen en ~24–48h (end_date mañana o
   * pasado). Idempotente por oferta (claim).
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async notifyExpiringSoon(): Promise<void> {
    try {
      const offers: Array<{ id: number; companyId: number; name: string }> =
        await this.offerRepo.query(
          `SELECT id, company_id AS companyId, name
             FROM offer
            WHERE status = 1
              AND end_date >= (CURDATE() + INTERVAL 1 DAY)
              AND end_date <= (CURDATE() + INTERVAL 2 DAY)`,
        );

      for (const offer of offers) {
        const claimed = await this.notifications.claimReminder(
          'offer_expiring',
          offer.id,
        );
        if (!claimed) continue;

        const data = buildNavigationData('offer', offer.id, offer.companyId);

        // Clientes con cita previa en la company.
        const clientIds = await this.clientsWithAppointments(offer.companyId);
        await this.notifications.createNotificationForUsers(clientIds, {
          type: 'offer',
          title: 'Oferta próxima a vencer',
          body: `La oferta ${offer.name} vence pronto`,
          data,
        });

        // Admin dueño.
        const company = await this.companyRepo.findOne({
          where: { id: offer.companyId },
        });
        await this.notifications.createNotificationForUsers(
          company?.userId ? [company.userId] : [],
          {
            type: 'offer',
            title: 'Oferta próxima a vencer',
            body: `Tu oferta ${offer.name} vence pronto`,
            data,
          },
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'desconocido';
      this.logger.warn(`Job notifyExpiringSoon falló: ${reason}`);
    }
  }

  /**
   * userId (únicos) de los clientes que han tenido alguna cita con la company,
   * derivado vía session → session_detail → service.company_id.
   */
  private async clientsWithAppointments(companyId: number): Promise<number[]> {
    if (!companyId) return [];
    const rows: Array<{ uid: number }> = await this.dataSource.query(
      `SELECT DISTINCT cl.user_id AS uid
         FROM session s
         JOIN session_detail sd ON sd.session_id = s.id
         JOIN service se ON se.id = sd.service_id
         JOIN client cl ON cl.id = s.client_id
        WHERE se.company_id = ? AND cl.user_id IS NOT NULL`,
      [companyId],
    );
    return rows.map((r) => r.uid);
  }

  private async companyName(companyId: number): Promise<string> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    return company?.name ?? 'la empresa';
  }
}
