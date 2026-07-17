import {
  Controller,
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

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollController {
  constructor(private readonly periodService: PayrollPeriodService) {}

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
