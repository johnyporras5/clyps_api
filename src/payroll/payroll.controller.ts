import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Header,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { ListPeriodsDto } from './dto/list-periods.dto';

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
    const result = await this.periodService.setFrequency(
      req.user.sub,
      dto.frequency,
      dto.startDate,
    );
    // Primer arranque: trae los cobros ya hechos desde la fecha elegida.
    // Best-effort (idempotente) para no romper la activación si algo falla.
    let backfill: {
      payments: number;
      commissions: number;
      tips: number;
    } | null = null;
    if (result.firstActivation) {
      try {
        backfill = await this.earningsService.backfillFromPayments(
          req.user.sub,
        );
      } catch {
        backfill = null;
      }
    }
    return { ...result, backfill };
  }

  // Periodos del proveedor ("Mi nómina"). Incluye el abierto: ve lo que va
  // ganando. Se declara antes que me/periods/:id.
  @Get('me/periods')
  @Roles('wrk')
  async listMyPeriods(
    @Request() req: AuthenticatedRequest,
    @Query() query: ListPeriodsDto,
  ) {
    return this.earningsService.listMyPeriods(req.user.sub, query);
  }

  // PAY-10: el proveedor ve SU propio estado de cuenta del periodo (solo lectura).
  // Los permisos salen del token: nunca puede pedir el de otro empleado/empresa.
  @Get('me/periods/:id')
  @Roles('wrk')
  async getMyStatement(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.earningsService.getMyPeriodStatement(+id, req.user.sub);
  }

  // PAY-10 (admin): el estado de cuenta de cualquier empleado de su empresa.
  @Get('period-details/:id/statement')
  @Roles('adm')
  async getEmployeeStatement(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.earningsService.getEmployeeStatement(+id, req.user.sub);
  }

  // Periodo en curso
  @Get('periods/current')
  @Roles('adm')
  async getCurrentPeriod(@Request() req: AuthenticatedRequest) {
    return this.earningsService.getCurrentPeriodSummary(req.user.sub);
  }

  // PAY-11: histórico de periodos ya cerrados/aprobados, filtrable por año.
  @Get('periods')
  @Roles('adm')
  async listPeriods(
    @Request() req: AuthenticatedRequest,
    @Query() query: ListPeriodsDto,
  ) {
    return this.earningsService.listHistoricPeriods(req.user.sub, query);
  }

  // PAY-11: exporta el periodo a CSV (una fila por empleado) para el contador.
  @Get('periods/:id/export.csv')
  @Roles('adm')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportPeriod(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, csv } = await this.earningsService.exportPeriodCsv(
      +id,
      req.user.sub,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM: sin él Excel en Windows rompe los acentos.
    return '﻿' + csv;
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
