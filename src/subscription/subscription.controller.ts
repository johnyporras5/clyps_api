import { Controller, Get, UseGuards } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PlansResponse } from './dto/plans-response.dto';

/**
 * SUB-1 (CLYP-333). El catálogo de planes es global, no depende de la company,
 * pero va detrás del token igual que el resto del panel: quien elige plan es el
 * dueño autenticado.
 *
 * `@Roles('adm')` va en el método a propósito: el RolesGuard lee la metadata
 * solo del handler, así que a nivel de clase se ignoraría en silencio.
 */
@Controller('subscription')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /** Planes disponibles con sus límites, más los días de prueba y gracia. */
  @Roles('adm')
  @Get('plans')
  getPlans(): PlansResponse {
    return this.subscriptionService.getPlans();
  }
}
