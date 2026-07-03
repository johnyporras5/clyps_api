// portfolio_pictures.controller.ts
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Get,
  UseGuards,
  Request,
  Param,
  ParseIntPipe,
  Delete,
  Put,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PortfolioPicturesService } from './portfolio_pictures.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

@Controller('portfolio-pictures')
export class PortfolioPicturesController {
  constructor(private readonly service: PortfolioPicturesService) {}

  @Get('company')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  async findMyCompanyPortfolio(
    @Request() req: AuthenticatedRequest,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.service.findAllByCompanyUser(req.user.sub, paginationDto);
  }

  @Post('company')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @UseInterceptors(FileInterceptor('picture'))
  async createForCompany(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.createForCompany(file, req.user.sub);
  }

  @Put('company/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @UseInterceptors(FileInterceptor('picture'))
  async updateForCompany(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.updateForCompany(id, file, req.user.sub);
  }

  @Delete('company/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeForCompany(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.removeForCompany(id, req.user.sub);
  }

  @Get('company/:companyId')
  async findByCompanyId(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.service.findAllByCompany(companyId, paginationDto);
  }

  /**
   * Subir una nueva imagen al portafolio del trabajador autenticado
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('picture'))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ) {
    const userId = req.user.sub; // JWT `sub` = user.id (no worker.id)
    return this.service.create(file, userId);
  }

  /**
   * Obtener todas las imágenes del trabajador autenticado (paginated)
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async findAllMyPictures(
    @Request() req: AuthenticatedRequest,
    @Query() paginationDto: PaginationDto,
  ) {
    const userId = req.user.sub;
    return this.service.findAllByUser(userId, paginationDto);
  }

  /**
   * Obtener una imagen específica del trabajador autenticado
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const userId = req.user.sub;
    return this.service.findOne(id, userId);
  }

  /**
   * Reemplazar una imagen existente
   */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('picture'))
  async update(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const userId = req.user.sub;
    return this.service.update(id, file, userId);
  }

  /**
   * Eliminar una imagen
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const userId = req.user.sub;
    await this.service.remove(id, userId);
  }

  /**
   * (Opcional) Obtener imágenes de cualquier worker por su ID
   * Útil para perfiles públicos. Aquí `workerId` SÍ es el id real del Worker.
   */
  @Get('worker/:workerId')
  @UseGuards(JwtAuthGuard)
  async findByWorkerId(
    @Param('workerId', ParseIntPipe) workerId: number,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.service.findAllByWorker(workerId, paginationDto);
  }
}
