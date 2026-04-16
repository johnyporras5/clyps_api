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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OfferService } from './offer.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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
  async findActiveServiceOffers(@Req() req: any) {
    const adminId = req.user.sub;
    return this.offerService.findActiveServiceOffers(adminId);
  }

  /**
   * Obtener todas las ofertas de la compañía
   * GET /offers/my-company
   */
  @Get('my-company')
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async findMyCompanyOffers(@Req() req: any) {
    const adminId = req.user.sub;
    return this.offerService.findAllByCompany(adminId);
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
    @Req() req: any,
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
    @Req() req: any,
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
    @Req() req: any,
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
  async activate(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
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
  async inactivate(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const adminId = req.user.sub;
    return this.offerService.setStatus(id, 0, adminId);
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
    @Req() req: any,
  ) {
    const adminId = req.user.sub;
    return this.offerService.remove(id, adminId);
  }
}
