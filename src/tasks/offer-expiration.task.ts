import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OfferService } from '../Offer/offer.service';

/**
 * Job de vencimiento/activación de ofertas por tiempo (CLYP-243).
 * Corre a diario y delega en OfferService.processScheduledOfferTransitions(),
 * que emite offer.expired / offer.activated sin acción de usuario.
 */
@Injectable()
export class OfferExpirationTask {
  private readonly logger = new Logger(OfferExpirationTask.name);

  constructor(private readonly offerService: OfferService) {}

  // Cada día a las 00:05 (hora de Venezuela), justo pasado el cambio de día,
  // para detectar las ofertas que vencieron ayer y las que activan hoy.
  @Cron('5 0 * * *', { timeZone: 'America/Caracas' })
  async processOfferTransitions() {
    this.logger.log('⏰ Ejecutando transiciones programadas de ofertas...');
    try {
      const result = await this.offerService.processScheduledOfferTransitions();
      if (result.expired > 0 || result.activated > 0) {
        this.logger.log(
          `✅ Ofertas: ${result.expired} vencida(s), ${result.activated} activada(s)`,
        );
      } else {
        this.logger.log('ℹ️ No había ofertas que vencieran o activaran hoy');
      }
    } catch (error) {
      this.logger.error(
        `❌ Error en transiciones de ofertas: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
