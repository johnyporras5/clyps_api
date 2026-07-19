import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { PayrollPeriodService } from './payroll-period.service';
import { PayrollEarningsService } from './payroll-earnings.service';
import { ChangePeriodStatusDto } from './dto/change-period-status.dto';
import { SetFrequencyDto } from './dto/set-frequency.dto';
import { CreateManualConceptDto } from './dto/create-manual-concept.dto';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { ReverseConceptDto } from './dto/reverse-concept.dto';

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollController {
  constructor(
    private readonly periodService: PayrollPeriodService,
    private readonly earningsService: PayrollEarningsService,
  ) {}

  // PAY-9: frecuencia de pago de la empresa (tarjeta de config).
  @Get('config')
  @Roles('adm')
  async getConfig(@Request() req: AuthenticatedRequest) {
    return this.periodService.getFrequencyConfig(req.user.sub);
  }

  @Patch('config')
  @Roles('adm')
  async setConfig(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SetFrequencyDto,
  ) {
    return this.periodService.setFrequency(req.user.sub, dto.frequency);
  }

  // PAY-6: resumen del periodo (totales en vivo, o del snapshot si ya se aprobó).
  @Get('periods/:id/summary')
  @Roles('adm')
  async getPeriodSummary(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.earningsService.getPeriodSummary(+id, req.user.sub);
  }

  // Avanza el periodo por la máquina de estados (open→review→approved→paid→closed).
  @Patch('periods/:id/status')
  @Roles('adm')
  async changePeriodStatus(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ChangePeriodStatusDto,
  ) {
    return this.periodService.changeStatus(+id, dto.status, req.user.sub);
  }

  // PAY-5: concepto manual (bono/deducción/ajuste) sobre el detalle de un empleado.
  @Post('period-details/:id/concepts')
  @Roles('adm')
  async addManualConcept(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateManualConceptDto,
  ) {
    return this.earningsService.addManualConcept(+id, dto, req.user.sub);
  }

  // PAY-7: revertir un concepto (el ajuste nace en el periodo abierto actual).
  @Post('concepts/:id/reverse')
  @Roles('adm')
  async reverseConcept(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ReverseConceptDto,
  ) {
    return this.earningsService.reverseConcept(+id, dto.reason, req.user.sub);
  }

  // PAY-8: registrar un pago (total o parcial) al empleado.
  @Post('period-details/:id/payouts')
  @Roles('adm')
  async recordPayout(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreatePayoutDto,
  ) {
    return this.earningsService.recordPayout(+id, dto, req.user.sub);
  }
}
