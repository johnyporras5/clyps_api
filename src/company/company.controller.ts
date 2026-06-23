import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  ParseIntPipe,
  UseGuards,
  Req,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyWithLogoUrl } from './types/company-with-logo-url.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginationResult } from '../common/utils/pagination.util';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Client } from '../client/entities/client.entity';
import { GetCompaniesFilterDto } from './dto/get-companies-filter.dto';
import { DirectoryQueryDto } from './dto/directory-query.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { companyRoom, companyPublicRoom } from '../realtime/rooms';

@Controller('companys')
@UseGuards(JwtAuthGuard)
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  async findAll(
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginationResult<CompanyWithLogoUrl>> {
    return this.companyService.findAll({
      page: paginationDto.page,
      limit: paginationDto.limit,
    });
  }

  @Get('filter')
  async findByFilters(
    @Query() dto: GetCompaniesFilterDto,
  ): Promise<PaginationResult<CompanyWithLogoUrl>> {
    return this.companyService.findByFilters(dto);
  }

  /**
   * Listado de compañías con logo, información, horario, ubicación,
   * equipo de trabajadores y servicios. Disponible para admin, worker y cliente.
   */
  @Get('directory')
  @UseGuards(RolesGuard)
  @Roles('adm', 'wrk', 'cli')
  async findAllDirectory(
    @Query() query: DirectoryQueryDto,
  ): Promise<PaginationResult<any>> {
    const categoryIds = [
      ...(query.categoryId ?? []),
      ...(query.categoryIds ?? []),
    ];
    return this.companyService.findAllWithDetails({
      page: query.page,
      limit: query.limit,
      city: query.city,
      categoryIds: categoryIds.length ? categoryIds : undefined,
      date: query.date,
      slots: query.slot,
    });
  }

  /**
   * Ciudades distintas (a partir de company.location) para los selectores
   * del filtro de directorio. Lista completa (sin paginar).
   */
  @Get('cities')
  @UseGuards(RolesGuard)
  @Roles('adm', 'wrk', 'cli')
  async getCities(): Promise<string[]> {
    return this.companyService.getDistinctCities();
  }

  /**
   * Categorías de compañía (deduplicadas por nombre) para los selectores
   * del filtro de directorio.
   */
  @Get('categories')
  @UseGuards(RolesGuard)
  @Roles('adm', 'wrk', 'cli')
  async getCategoryOptions(): Promise<{ id: number; name: string }[]> {
    return this.companyService.getCategoryOptions();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<any> {
    return this.companyService.findOne(id);
  }

  @Get('admin/profile')
  async getAdminProfile(
    @Req() req: AuthenticatedRequest,
  ): Promise<CompanyWithLogoUrl> {
    const userId = req.user.sub;
    return this.companyService.findByUserId(userId);
  }

  @Post()
  async create(@Body() createCompanyDto: CreateCompanyDto): Promise<Company> {
    return this.companyService.create(createCompanyDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ): Promise<CompanyWithLogoUrl> {
    return this.companyService.update(id, updateCompanyDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.companyService.remove(id);
  }

  @Put('admin/profile')
  @UseInterceptors(FileInterceptor('logo'))
  async updateAdminProfile(
    @Req() req: AuthenticatedRequest,
    @Body() updateAdminProfileDto: UpdateAdminProfileDto,
    @UploadedFile() logoFile?: Express.Multer.File,
  ): Promise<CompanyWithLogoUrl> {
    const userId = req.user.sub;
    const result = await this.companyService.updateAdminProfile(
      userId,
      updateAdminProfileDto,
      logoFile,
    );

    // schedule.company_updated SOLO si el update incluyó el horario
    // (calendarDetail = schedule + exceptions). Evita ruido en updates de
    // logo/datos. + availability.changed para la empresa (CLYP-245).
    if (updateAdminProfileDto.calendarDetail !== undefined) {
      const companyId = result.id;
      this.realtime.emitEntity(
        [companyRoom(companyId), companyPublicRoom(companyId)],
        {
          type: 'schedule.company_updated',
          entityId: companyId,
          companyId,
          data: { companyId, calendarDetail: result.calendarDetail },
        },
      );
      this.realtime.emitEntity(companyPublicRoom(companyId), {
        type: 'availability.changed',
        entityId: companyId,
        companyId,
        data: { companyId, date: null, companyWorkerIds: [] },
      });
    }

    return result;
  }

  /**
   * Endpoint para eliminar temporalmente un trabajador (puede restaurarse)
   */
  @Delete('workers/:companyWorkerId/temporary')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async temporarilyRemoveWorker(
    @Param('companyWorkerId', ParseIntPipe) companyWorkerId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string; canRestore: boolean }> {
    const adminId = req.user.sub;
    const result = await this.companyService.temporarilyRemoveWorkerFromCompany(
      adminId,
      companyWorkerId,
    );

    // worker.removed (CLYP-246): baja temporal del worker del roster.
    const companyId = req.user?.companyId;
    if (companyId) {
      this.realtime.emitEntity(
        [companyRoom(companyId), companyPublicRoom(companyId)],
        {
          type: 'worker.removed',
          entityId: companyWorkerId,
          companyId,
          data: { companyWorkerId },
        },
      );
    }

    return result;
  }

  /**
   * Endpoint para eliminar permanentemente un trabajador (no puede restaurarse)
   */
  @Delete('workers/:companyWorkerId/permanent')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async permanentlyRemoveWorker(
    @Param('companyWorkerId', ParseIntPipe) companyWorkerId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string; canRestore: boolean }> {
    const adminId = req.user.sub;
    return this.companyService.permanentlyRemoveWorkerFromCompany(
      adminId,
      companyWorkerId,
    );
  }

  /**
   * Endpoint para restaurar un trabajador temporalmente eliminado
   */
  @Put('workers/:companyWorkerId/restore')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async restoreWorker(
    @Param('companyWorkerId', ParseIntPipe) companyWorkerId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    const adminId = req.user.sub;
    return this.companyService.restoreTemporarilyRemovedWorker(
      adminId,
      companyWorkerId,
    );
  }

  /**
   * Endpoint para listar trabajadores temporalmente eliminados
   */
  @Get('workers/temporarily-removed')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async getTemporarilyRemovedWorkers(
    @Req() req: AuthenticatedRequest,
  ): Promise<CompanyWorker[]> {
    const adminId = req.user.sub;
    return this.companyService.getTemporarilyRemovedWorkers(adminId);
  }

  /**
   * Endpoint para eliminar temporalmente un cliente (puede restaurarse)
   */
  @Delete('clients/:clientId/temporary')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async temporarilyRemoveClient(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string; canRestore: boolean }> {
    const adminId = req.user.sub;
    const result = await this.companyService.temporarilyRemoveClientFromCompany(
      adminId,
      clientId,
    );

    // client.removed (CLYP-246): baja temporal del cliente. Room: company.
    const companyId = req.user?.companyId;
    if (companyId) {
      this.realtime.emitEntity(companyRoom(companyId), {
        type: 'client.removed',
        entityId: clientId,
        companyId,
        data: { clientId },
      });
    }

    return result;
  }

  /**
   * Endpoint para eliminar permanentemente un cliente (no puede restaurarse)
   */
  @Delete('clients/:clientId/permanent')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async permanentlyRemoveClient(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string; canRestore: boolean }> {
    const adminId = req.user.sub;
    return this.companyService.permanentlyRemoveClientFromCompany(
      adminId,
      clientId,
    );
  }

  /**
   * Endpoint para restaurar un cliente temporalmente eliminado
   */
  @Put('clients/:clientId/restore')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async restoreClient(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    const adminId = req.user.sub;
    return this.companyService.restoreTemporarilyRemovedClient(
      adminId,
      clientId,
    );
  }

  /**
   * Endpoint para listar clientes temporalmente eliminados
   */
  @Get('clients/temporarily-removed')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async getTemporarilyRemovedClients(
    @Req() req: AuthenticatedRequest,
  ): Promise<Client[]> {
    const adminId = req.user.sub;
    return this.companyService.getTemporarilyRemovedClients(adminId);
  }
}
