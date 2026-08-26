import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { CashProfitabilityService } from './cash-profitability.service';
import { QueryProfitabilityDto } from './dto/query-profitability.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/** Reporte de rentabilidad del período (CLYP-357). */
@Controller('finances')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('adm')
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
