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
import { CompanyIncomeQueryDto } from './dto/company-income-query.dto';
import { CompanyIncomeTimelineQueryDto } from './dto/company-income-timeline-query.dto';
import { ClientsReportQueryDto } from './dto/clients-report-query.dto';
import { ClientsListQueryDto } from './dto/clients-list-query.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('income-services')
  @Roles('adm')
  async getIncomeByServices(
    @Request() req: AuthenticatedRequest,
    @Query() query: IncomeServicesQueryDto,
  ) {
    const adminId = req.user.sub;
    return this.reportsService.getIncomeByServices(
      adminId,
      query.startDate,
      query.endDate,
      query.page,
      query.limit,
    );
  }

  // Reporte de productos
  @Get('income-products')
  @Roles('adm')
  async getIncomeByProducts(
    @Request() req: AuthenticatedRequest,
    @Query() query: IncomeServicesQueryDto,
  ) {
    const adminId = req.user.sub;
    return this.reportsService.getIncomeByProducts(
      adminId,
      query.startDate,
      query.endDate,
      query.page,
      query.limit,
    );
  }

  // Comisiones de productos por empleado (quién ganó comisión y de qué
  // productos), dentro del rango. Alimenta la vista "Empleados" del reporte.
  @Get('income-products/commissions')
  @Roles('adm')
  async getProductCommissionsByEmployee(
    @Request() req: AuthenticatedRequest,
    @Query() query: IncomeServicesQueryDto,
  ) {
    return this.reportsService.getProductCommissionsByEmployee(
      req.user.sub,
      query.startDate,
      query.endDate,
    );
  }

  @Get('income-employees')
  @Roles('adm')
  async getIncomeByEmployees(
    @Request() req: AuthenticatedRequest,
    @Query() query: IncomeServicesQueryDto,
  ) {
    const adminId = req.user.sub;
    return this.reportsService.getIncomeByEmployees(
      adminId,
      query.startDate,
      query.endDate,
      query.page,
      query.limit,
    );
  }

  // Ingresos por compañía: solo la parte de la company, en caja real (cobrado),
  // por moneda y en Bs acumulado (tasa histórica de cada cobro).
  @Get('company-income')
  @Roles('adm')
  async getCompanyIncome(
    @Request() req: AuthenticatedRequest,
    @Query() query: CompanyIncomeQueryDto,
  ) {
    return this.reportsService.getCompanyIncome(
      req.user.sub,
      query.startDate,
      query.endDate,
    );
  }

  // Serie temporal de "Ingresos por compañía", agrupada por bucket
  // (day|week|month|quarter|semester|year), por fecha de cobro.
  @Get('company-income/timeline')
  @Roles('adm')
  async getCompanyIncomeTimeline(
    @Request() req: AuthenticatedRequest,
    @Query() query: CompanyIncomeTimelineQueryDto,
  ) {
    return this.reportsService.getCompanyIncomeTimeline(
      req.user.sub,
      query.startDate,
      query.endDate,
      query.bucket ?? 'month',
    );
  }

  @Get('clients')
  @Roles('adm')
  async getClientsReport(
    @Request() req: AuthenticatedRequest,
    @Query() query: ClientsReportQueryDto,
  ) {
    const adminId = req.user.sub;

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
  async getClientsList(
    @Request() req: AuthenticatedRequest,
    @Query() query: ClientsListQueryDto,
  ) {
    const adminId = req.user.sub;
    return this.reportsService.getClientsList(adminId, query.category);
  }
}
