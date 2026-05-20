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
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('portfolio-pictures')
@UseGuards(JwtAuthGuard)
export class PortfolioPicturesController {
  constructor(private readonly service: PortfolioPicturesService) {}

  /**
   * Subir una nueva imagen al portafolio del trabajador autenticado
   */
  @Post()
  @UseInterceptors(FileInterceptor('picture'))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    const userId = req.user.sub; // JWT `sub` = user.id (no worker.id)
    return this.service.create(file, userId);
  }

  /**
   * Obtener todas las imágenes del trabajador autenticado (paginated)
   */
  @Get()
  async findAllMyPictures(
    @Request() req,
    @Query() paginationDto: PaginationDto,
  ) {
    const userId = req.user.sub;
    return this.service.findAllByUser(userId, paginationDto);
  }

  /**
   * Obtener una imagen específica del trabajador autenticado
   */
  @Get(':id')
  async findOne(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const userId = req.user.sub;
    return this.service.findOne(id, userId);
  }

  /**
   * Reemplazar una imagen existente
   */
  @Put(':id')
  @UseInterceptors(FileInterceptor('picture'))
  async update(
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const userId = req.user.sub;
    return this.service.update(id, file, userId);
  }

  /**
   * Eliminar una imagen
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Request() req,
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
  async findByWorkerId(
    @Param('workerId', ParseIntPipe) workerId: number,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.service.findAllByWorker(workerId, paginationDto);
  }
}
