import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { CashProfitabilityService } from './cash-profitability.service';
import { QueryProfitabilityDto } from './dto/query-profitability.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SubscriptionAccessGuard } from '../subscription/guards/subscription-access.guard';
import { RequiresOperationalSubscription } from '../subscription/guards/requires-feature.decorator';

/** Reporte de rentabilidad del período (CLYP-357). */
@Controller('finances')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionAccessGuard)
@Roles('adm')
// SUB-12: "Rentabilidad" es análisis de datos, no operación. El dueño
// bloqueado la sigue viendo, igual que el resto de ese menú.
@RequiresOperationalSubscription('adm')
export class CashProfitabilityController {
  constructor(
    private readonly cashProfitabilityService: CashProfitabilityService,
  ) {}

  @Get('profitability')
  getProfitability(
    @Req() req: AuthenticatedRequest,
    @Query() query: QueryProfitabilityDto,
  ) {
    return this.cashProfitabilityService.getProfitability(
      req.user.sub,
      query.from,
      query.to,
    );
  }
}
