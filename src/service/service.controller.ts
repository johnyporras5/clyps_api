import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Patch,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { ServiceService } from './service.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('services')
@UseGuards(JwtAuthGuard)
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  // ==================== ENDPOINTS PARA ADMINISTRADORES ====================

  /**
   * Obtener todos los servicios de mi compañía CON información de workers
   * GET /services/my-company
   * Solo administradores
   */
  @Get('my-company')
  @UseGuards(RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async findMyCompanyServices(
    @Req() req: any,
    @Query() paginationDto: PaginationDto, // <-- Agregar parámetro de paginación
  ): Promise<any> {
    const adminId = req.user.sub;
    const { page, limit } = paginationDto;
    return this.serviceService.findAllByCompanyWithWorkers(adminId, {
      page,
      limit,
    });
  }

  /**
   * Obtener un servicio específico CON información de workers.
   * GET /services/my-company/:id
   * Accesible para administradores, trabajadores y clientes.
   * Para admin se valida que el servicio pertenezca a su compañía.
   */
  @Get('my-company/:id')
  @UseGuards(RolesGuard)
  @Roles('adm', 'wrk', 'cli')
  @HttpCode(HttpStatus.OK)
  async findOneMyCompany(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ): Promise<any> {
    const userId = req.user.sub;
    const userType = req.user.userType;
    return this.serviceService.findOneWithWorkersForUser(id, userId, userType);
  }

  /**
   * Obtener los servicios ACTIVOS de una compañía por ID (paginado) con info de workers.
   * GET /services/company/:companyId
   * Accesible para administradores, trabajadores y clientes.
   */
  @Get('company/:companyId')
  @UseGuards(RolesGuard)
  @Roles('adm', 'wrk', 'cli')
  @HttpCode(HttpStatus.OK)
  async findByCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() paginationDto: PaginationDto,
  ): Promise<any> {
    const { page, limit } = paginationDto;
    return this.serviceService.findAllByCompanyIdWithWorkers(companyId, {
      page,
      limit,
    });
  }

  /**
   * Obtener los trabajadores asignados a un servicio específico.
   * GET /services/:id/workers
   * Accesible para administradores, trabajadores y clientes.
   * Para admin se valida que el servicio pertenezca a su compañía.
   */
  @Get(':id/workers')
  @UseGuards(RolesGuard)
  @Roles('adm', 'wrk', 'cli')
  @HttpCode(HttpStatus.OK)
  async findWorkersByService(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ): Promise<any> {
    const userId = req.user.sub;
    const userType = req.user.userType;
    return this.serviceService.findWorkersByServiceId(id, userId, userType);
  }

  /**
   * Crear un servicio para mi compañía
   * POST /services/my-company
   * Solo administradores
   */
  @Post('my-company')
  @UseGuards(RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.CREATED)
  async createForMyCompany(
    @Body() createServiceDto: CreateServiceDto,
    @Req() req: any,
  ): Promise<any> {
    const adminId = req.user.sub;
    return this.serviceService.create(createServiceDto, adminId);
  }

  /**
   * Actualizar un servicio de mi compañía
   * PUT /services/my-company/:id
   * Solo administradores
   */
  @Put('my-company/:id')
  @UseGuards(RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async updateMyCompany(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateServiceDto: UpdateServiceDto,
    @Req() req: any,
  ): Promise<any> {
    const adminId = req.user.sub;
    return this.serviceService.update(id, updateServiceDto, adminId);
  }

  /**
   * Inactivar un servicio de mi compañía
   * PATCH /services/my-company/:id/inactive
   * Solo administradores
   */
  @Patch('my-company/:id/inactive')
  @UseGuards(RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async inactivateMyCompany(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ): Promise<any> {
    const adminId = req.user.sub;
    return this.serviceService.inactivate(id, adminId);
  }

  /**
   * Eliminar un servicio de mi compañía
   * DELETE /services/my-company/:id
   * Solo administradores
   */
  @Delete('my-company/:id')
  @UseGuards(RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMyCompany(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ): Promise<void> {
    const adminId = req.user.sub;
    return this.serviceService.remove(id, adminId);
  }
}
