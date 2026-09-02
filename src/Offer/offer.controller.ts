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
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OfferService } from './offer.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { FindOffersDto } from './dto/find-offers.dto';

@Controller('offers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OfferController {
  constructor(private readonly offerService: OfferService) {}

  /**
   * Obtener todos los servicios en oferta ACTIVA y VIGENTE de la compañía.
   * Usado por el frontend para mostrar la lista de servicios en oferta
   * al momento de crear una sesión.
   * GET /offers/my-company/active-services
   *  Debe ir ANTES de /my-company/:id para evitar conflicto de rutas
   */
  @Get('my-company/active-services')
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async findActiveServiceOffers(
    @Req() req: AuthenticatedRequest,
    @Query() paginationDto: PaginationDto,
  ) {
    const adminId = req.user.sub;
    const { page, limit } = paginationDto;
    return this.offerService.findActiveServiceOffers(adminId, { page, limit });
  }

  /**
   * Obtener los servicios en oferta ACTIVA y VIGENTE de una compañía por ID.
   * GET /offers/company/:companyId/active-services
   * Accesible para administradores, trabajadores y clientes.
   */
  @Get('company/:companyId/active-services')
  @Roles('adm', 'wrk', 'cli')
  @HttpCode(HttpStatus.OK)
  async findActiveServiceOffersByCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.offerService.findActiveServiceOffersByCompanyId(companyId);
  }

  /**
   * Obtener todas las ofertas de la compañía
   * GET /offers/my-company
   */
  @Get('my-company')
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async findMyCompanyOffers(
    @Req() req: AuthenticatedRequest,
    @Query() paginationDto: FindOffersDto,
  ) {
    const adminId = req.user.sub;
    const { page, limit, status, name } = paginationDto;
    return this.offerService.findAllByCompany(adminId, {
      page,
      limit,
      status,
      name,
    });
  }

  /**
   * Ofertas disponibles. Admin y worker las ven todas; al cliente se le
   * muestran solo las de los negocios con los que tiene relación.
   * GET /offers/all
   */
  @Get('all')
  @Roles('adm', 'wrk', 'cli')
  @HttpCode(HttpStatus.OK)
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.offerService.findAll(req.user.userType, req.user.sub);
  }

  /**
   * Obtener una oferta específica de la compañía
   * GET /offers/my-company/:id
   */
  @Get('my-company/:id')
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async findOneMyCompany(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminId = req.user.sub;
    return this.offerService.findOne(id, adminId);
  }

  /**
   * Crear una nueva oferta para la compañía
   * POST /offers/my-company
   */
  @Post('my-company')
  @Roles('adm')
  @UseInterceptors(FileInterceptor('logo'))
  @HttpCode(HttpStatus.CREATED)
  async createForMyCompany(
    @Body() createOfferDto: CreateOfferDto,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() logoFile?: Express.Multer.File,
  ) {
    const adminId = req.user.sub;
    return this.offerService.create(createOfferDto, adminId, logoFile);
  }

  /**
   * Actualizar una oferta existente
   * PUT /offers/my-company/:id
   */
  @Put('my-company/:id')
  @Roles('adm')
  @UseInterceptors(FileInterceptor('logo'))
  @HttpCode(HttpStatus.OK)
  async updateMyCompany(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOfferDto: UpdateOfferDto,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() logoFile?: Express.Multer.File,
  ) {
    const adminId = req.user.sub;
    return this.offerService.update(id, updateOfferDto, adminId, logoFile);
  }

  /**
   * Activar una oferta
   * PATCH /offers/my-company/:id/activate
   */
  @Patch('my-company/:id/activate')
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminId = req.user.sub;
    return this.offerService.setStatus(id, 1, adminId);
  }

  /**
   * Inactivar una oferta
   * PATCH /offers/my-company/:id/inactivate
   */
  @Patch('my-company/:id/inactivate')
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async inactivate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminId = req.user.sub;
    return this.offerService.setStatus(id, 0, adminId);
  }

  /**
   * [PRUEBA] Disparar manualmente las transiciones programadas de ofertas
   * (vencer activas con end_date pasado, activar las que inician hoy).
   * Equivale a ejecutar el cron diario al instante. Útil para QA con Postman.
   * POST /offers/process-transitions
   */
  @Post('process-transitions')
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async processTransitions() {
    return this.offerService.processScheduledOfferTransitions();
  }

  /**
   * Eliminar una oferta
   * DELETE /offers/my-company/:id
   */
  @Delete('my-company/:id')
  @Roles('adm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMyCompany(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminId = req.user.sub;
    return this.offerService.remove(id, adminId);
  }
}
