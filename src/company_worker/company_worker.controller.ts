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
  Patch,
  Query,
  Headers,
} from '@nestjs/common';
import { CompanyWorkerService } from './company_worker.service';
import { CompanyWorker } from './entities/company_worker.entity';
import { CreateCompanyWorkerDto } from './dto/create-company_worker.dto';
import { UpdateCompanyWorkerDto } from './dto/update-company_worker.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('company-workers')
export class CompanyWorkerController {
  constructor(
    private readonly companyWorkerService: CompanyWorkerService,
  ) {}

  // ==================== ENDPOINTS CRUD BÁSICOS ====================

  /**
   * Obtener todas las relaciones compañía-trabajador
   * GET /company-workers
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async findAll(): Promise<CompanyWorker[]> {
    return this.companyWorkerService.findAll();
  }

  /**
   * Obtener una relación específica por ID
   * GET /company-workers/:id
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<CompanyWorker> {
    return this.companyWorkerService.findOne(id);
  }

  /**
   * Crear una nueva relación compañía-trabajador
   * POST /company-workers
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createCompanyWorkerDto: CreateCompanyWorkerDto): Promise<CompanyWorker> {
    return this.companyWorkerService.create(createCompanyWorkerDto);
  }

 /**
 * Modificar trabajador en la compañía (admin modifica trabajador de su compañía)
 * PUT /company-workers/worker/:workerId
 */
@Put('worker/:workerId')
@UseGuards(JwtAuthGuard)
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
 */
@Put('user/:userId')
@UseGuards(JwtAuthGuard)
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
   */
  @Delete('worker/:workerId')
  @UseGuards(JwtAuthGuard)
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
   */
  @Delete('user/:userId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async removeWorkerByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: any,
  ): Promise<{ message: string }> {
    const adminId = req.user.sub;
    return this.companyWorkerService.removeWorkerByUserId(userId, adminId);
  }

 }