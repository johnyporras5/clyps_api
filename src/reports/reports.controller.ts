import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IncomeServicesQueryDto } from './dto/income-services-query.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('income-services')
  @Roles('adm')
  async getIncomeByServices(
    @Request() req,
    @Query() query: IncomeServicesQueryDto,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.reportsService.getIncomeByServices(adminId, query.startDate, query.endDate, query.page, query.limit);
  }

  @Get('income-employees')
  @Roles('adm')
  async getIncomeByEmployees(
    @Request() req,
    @Query() query: IncomeServicesQueryDto,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.reportsService.getIncomeByEmployees(adminId, query.startDate, query.endDate, query.page, query.limit);
  }
}
