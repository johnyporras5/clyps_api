import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CampaignEmailService } from './campaign-email.service';

/**
 * El reloj de las campañas de la promo Black Friday.
 *
 * Cada 10 minutos pregunta "¿le toca a alguna?" y, si sí, la manda. No hace
 * falta más precisión: el correo de intriga sale entre las 10:00 y las 10:10.
 *
 * No hace nada si `CAMPAIGN_EMAILS_ENABLED` no está en `true` (solo producción).
 */
@Injectable()
export class CampaignEmailTask {
  private readonly logger = new Logger(CampaignEmailTask.name);

  constructor(private readonly campaigns: CampaignEmailService) {}

  @Cron('*/10 * * * *', { timeZone: 'America/Caracas' })
  async tick(): Promise<void> {
    try {
      await this.campaigns.runScheduled();
    } catch (error) {
      this.logger.error(
        `❌ Error en el envío automático de campañas: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
