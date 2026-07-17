import {
  Controller,
  Get,
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
import { ChangePeriodStatusDto } from './dto/change-period-status.dto';
import { SetFrequencyDto } from './dto/set-frequency.dto';

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollController {
  constructor(private readonly periodService: PayrollPeriodService) {}

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
}
