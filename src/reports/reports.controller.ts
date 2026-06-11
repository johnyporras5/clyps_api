import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IncomeServicesQueryDto } from './dto/income-services-query.dto';
import { ClientsReportQueryDto } from './dto/clients-report-query.dto';
import { ClientsListQueryDto } from './dto/clients-list-query.dto';

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
    return this.reportsService.getIncomeByServices(
      adminId,
      query.startDate,
      query.endDate,
      query.page,
      query.limit,
    );
  }

  @Get('income-employees')
  @Roles('adm')
  async getIncomeByEmployees(
    @Request() req,
    @Query() query: IncomeServicesQueryDto,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.reportsService.getIncomeByEmployees(
      adminId,
      query.startDate,
      query.endDate,
      query.page,
      query.limit,
    );
  }

  @Get('clients')
  @Roles('adm')
  async getClientsReport(
    @Request() req,
    @Query() query: ClientsReportQueryDto,
  ) {
    const adminId = req.user?.id || req.user?.sub;

    const hasGranularity = !!query.granularity;
    const hasRange = !!query.startDate && !!query.endDate;
    if (!hasGranularity && !hasRange) {
      throw new BadRequestException(
        'Debe enviar "granularity" o el par "startDate" + "endDate".',
      );
    }

    return this.reportsService.getClientsReport(adminId, {
      granularity: query.granularity,
      startDate: query.startDate,
      endDate: query.endDate,
      bucket: query.bucket,
    });
  }

  @Get('clients/list')
  @Roles('adm')
  async getClientsList(@Request() req, @Query() query: ClientsListQueryDto) {
    const adminId = req.user?.id || req.user?.sub;
    return this.reportsService.getClientsList(adminId, query.category);
  }
}
