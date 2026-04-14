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

@Controller('companys')
@UseGuards(JwtAuthGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) { }

  @Get()
  async findAll(
    @Query() paginationDto: PaginationDto
  ): Promise<PaginationResult<CompanyWithLogoUrl>> {
    return this.companyService.findAll({
      page: paginationDto.page,
      limit: paginationDto.limit
    });
  }

  @Get('filter')
  async findByFilters(
    @Query() dto: GetCompaniesFilterDto
  ): Promise<PaginationResult<CompanyWithLogoUrl>> {
    return this.companyService.findByFilters(dto);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number
  ): Promise<CompanyWithLogoUrl> {
    return this.companyService.findOne(id);
  }

  @Get('admin/profile')
  async getAdminProfile(
    @Req() req
  ): Promise<CompanyWithLogoUrl> {
    const userId = req.user.sub;
    return this.companyService.findByUserId(userId);
  }

  @Post()
  async create(
    @Body() createCompanyDto: CreateCompanyDto
  ): Promise<Company> {
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
  async remove(
    @Param('id', ParseIntPipe) id: number
  ): Promise<void> {
    return this.companyService.remove(id);
  }


  @Put('admin/profile')
  @UseInterceptors(FileInterceptor('logo'))
  async updateAdminProfile(
    @Req() req,
    @Body() updateAdminProfileDto: UpdateAdminProfileDto,
    @UploadedFile() logoFile?: Express.Multer.File
  ): Promise<CompanyWithLogoUrl> {
    const userId = req.user.sub;
    return this.companyService.updateAdminProfile(
      userId,
      updateAdminProfileDto,
      logoFile
    );
  }


  /**
  * Endpoint para eliminar temporalmente un trabajador (puede restaurarse)
  */
  @Delete('workers/:workerId/temporary')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async temporarilyRemoveWorker(
    @Param('workerId', ParseIntPipe) workerId: number,
    @Req() req: any
  ): Promise<{ message: string; canRestore: boolean }> {
    const adminId = req.user.sub;
    return this.companyService.temporarilyRemoveWorkerFromCompany(adminId, workerId);
  }

  /**
   * Endpoint para eliminar permanentemente un trabajador (no puede restaurarse)
   */
  @Delete('workers/:workerId/permanent')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async permanentlyRemoveWorker(
    @Param('workerId', ParseIntPipe) workerId: number,
    @Req() req: any
  ): Promise<{ message: string; canRestore: boolean }> {
    const adminId = req.user.sub;
    return this.companyService.permanentlyRemoveWorkerFromCompany(adminId, workerId);
  }

  /**
   * Endpoint para restaurar un trabajador temporalmente eliminado
   */
  @Put('workers/:workerId/restore')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async restoreWorker(
    @Param('workerId', ParseIntPipe) workerId: number,
    @Req() req: any
  ): Promise<{ message: string }> {
    const adminId = req.user.sub;
    return this.companyService.restoreTemporarilyRemovedWorker(adminId, workerId);
  }

  /**
   * Endpoint para listar trabajadores temporalmente eliminados
   */
  @Get('workers/temporarily-removed')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async getTemporarilyRemovedWorkers(
    @Req() req: any
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
    @Req() req: any
  ): Promise<{ message: string; canRestore: boolean }> {
    const adminId = req.user.sub;
    return this.companyService.temporarilyRemoveClientFromCompany(adminId, clientId);
  }

  /**
   * Endpoint para eliminar permanentemente un cliente (no puede restaurarse)
   */
  @Delete('clients/:clientId/permanent')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async permanentlyRemoveClient(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Req() req: any
  ): Promise<{ message: string; canRestore: boolean }> {
    const adminId = req.user.sub;
    return this.companyService.permanentlyRemoveClientFromCompany(adminId, clientId);
  }

  /**
   * Endpoint para restaurar un cliente temporalmente eliminado
   */
  @Put('clients/:clientId/restore')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async restoreClient(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Req() req: any
  ): Promise<{ message: string }> {
    const adminId = req.user.sub;
    return this.companyService.restoreTemporarilyRemovedClient(adminId, clientId);
  }

  /**
   * Endpoint para listar clientes temporalmente eliminados
   */
  @Get('clients/temporarily-removed')
  @UseGuards(RolesGuard)
  @Roles('adm')
  async getTemporarilyRemovedClients(
    @Req() req: any
  ): Promise<Client[]> {
    const adminId = req.user.sub;
    return this.companyService.getTemporarilyRemovedClients(adminId);
  }
}