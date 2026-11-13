import { Controller, Get, Header } from '@nestjs/common';
import { PromoService } from './promo.service';
import type { PublicOffersResponse } from './dto/offers-response.dto';

/**
 * La promo Black Friday para la LANDING (sin sesión).
 *
 * Público a propósito: lo consulta quien todavía no tiene cuenta. Solo expone
 * lo que ya es público por la propia promo —precios y fechas—, nunca datos de
 * un salón. Pasa por el rate limit global como cualquier otra ruta.
 */
@Controller('public/promo')
export class PublicPromoController {
  constructor(private readonly promo: PromoService) {}

  @Get()
  // Unos minutos de caché en el navegador/CDN: la landing la pide en cada
  // visita y el dato solo cambia dos veces en toda la campaña.
  @Header('Cache-Control', 'public, max-age=300')
  getOffers(): PublicOffersResponse {
    return this.promo.publicOffers();
  }
}
