import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Query

} from '@nestjs/common';
import { CompanyWorkerService } from './company_worker.service';
import { CompanyWorker } from './entities/company_worker.entity';
import { CreateCompanyWorkerDto } from './dto/create-company_worker.dto';
import { UpdateCompanyWorkerDto } from './dto/update-company_worker.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginatedWorkerListResult } from './interface/worker-list.interface';
import { CompanyWorkersPaginationDto } from './dto/company-workers-pagination.dto';

@Controller('company-workers')
export class CompanyWorkerController {
  constructor(
    private readonly companyWorkerService: CompanyWorkerService,
  ) { }

  // ==================== ENDPOINTS CRUD BÁSICOS ====================

  /**
   * Obtener todas las relaciones compañía-trabajador
   * GET /company-workers
   * Solo administradores
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async findAll(): Promise<CompanyWorker[]> {
    return this.companyWorkerService.findAll();
  }

  /**
   * Obtener una relación específica por ID
   * GET /company-workers/:id
   * Solo administradores
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<CompanyWorker> {
    return this.companyWorkerService.findOne(id);
  }

  /**
   * Crear una nueva relación compañía-trabajador
   * POST /company-workers
   * Solo administradores
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createCompanyWorkerDto: CreateCompanyWorkerDto): Promise<CompanyWorker> {
    return this.companyWorkerService.create(createCompanyWorkerDto);
  }

  /**
   * Modificar trabajador en la compañía (admin modifica trabajador de su compañía)
   * PUT /company-workers/worker/:workerId
   * Solo administradores
   */
  @Put('worker/:workerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async updateWorkerInCompany(
    @Param('workerId', ParseIntPipe) workerId: number,
    @Req() req: any,
    @Body() updateCompanyWorkerDto: UpdateCompanyWorkerDto,
  ): Promise<CompanyWorker> {
    const adminId = req.user.sub;
    return this.companyWorkerService.updateWorkerInCompany(workerId, adminId, updateCompanyWorkerDto);
  }

  /**
   * Modificar trabajador por ID de usuario
   * PUT /company-workers/user/:userId
   * Solo administradores
   */
  @Put('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async updateWorkerByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: any,
    @Body() updateCompanyWorkerDto: UpdateCompanyWorkerDto,
  ): Promise<CompanyWorker> {
    const adminId = req.user.sub;
    return this.companyWorkerService.updateWorkerByUserId(userId, adminId, updateCompanyWorkerDto);
  }

  // ==================== ENDPOINTS ESPECÍFICOS DE GESTIÓN ====================

  /**
   * Eliminar trabajador de la compañía (admin solo elimina de su compañía)
   * DELETE /company-workers/worker/:workerId
   * Solo administradores
   */
  @Delete('worker/:workerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async removeWorkerFromCompany(
    @Param('workerId', ParseIntPipe) workerId: number,
    @Req() req: any,
  ): Promise<{ message: string }> {
    const adminId = req.user.sub;
    return this.companyWorkerService.removeWorkerFromCompany(workerId, adminId);
  }

  /**
   * Eliminar trabajador por ID de usuario
   * DELETE /company-workers/user/:userId
   * Solo administradores
   */
  @Delete('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async removeWorkerByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: any,
  ): Promise<{ message: string }> {
    const adminId = req.user.sub;
    return this.companyWorkerService.removeWorkerByUserId(userId, adminId);
  }

  // ==================== ENDPOINTS ADICIONALES PARA TRABAJADORES ====================

  /**
   * Obtener mis datos de compañía (para trabajadores)
   * GET /company-workers/my-company-data
   * Solo trabajadores
   */
  @Get('my-company-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('wrk')
  @HttpCode(HttpStatus.OK)
  async getMyCompanyData(@Req() req: any): Promise<CompanyWorker> {
    const userId = req.user.sub;

    // Este método necesitarías crearlo en el servicio
    // return this.companyWorkerService.findByUserId(userId);

    // O puedes usar el endpoint existente con lógica específica
    const adminId = req.user.sub; // Esto sería el workerId
    // Adapta según tu lógica
    throw new Error('Método no implementado aún');
  }

  /**
    * Obtener trabajadores de mi compañía con filtro por nombre
    * GET /company-workers/my-company/workers
    * Solo administradores
    */
  @Get('my-company/workers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async getMyCompanyWorkers(
    @Req() req: any,
    @Query() paginationDto: CompanyWorkersPaginationDto,
  ): Promise<PaginatedWorkerListResult> {
    const adminId = req.user.sub;

    return await this.companyWorkerService.getCompanyWorkersWithNameFilterPaginated(
      adminId,
      paginationDto
    );
  }

}

