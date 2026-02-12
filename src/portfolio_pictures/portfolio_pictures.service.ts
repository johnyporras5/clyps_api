import { Injectable, NotFoundException,Logger  } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortfolioPictures } from './entities/portfolio_pictures.entity';
import { FileUploadService } from '../common/services/file_upload.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { PortfolioPictureWithUrl } from './types/portfolio-picture-with-url.type';

@Injectable()
export class PortfolioPicturesService {
   private readonly logger = new Logger(PortfolioPicturesService.name);
  private readonly FOLDER = 'portfolio'; 
  constructor(
    @InjectRepository(PortfolioPictures)
    private repository: Repository<PortfolioPictures>,
    private fileUploadService: FileUploadService,

  ) {}

/**
   * Subir una nueva imagen al portafolio de un trabajador
   */
  async create(
    file: Express.Multer.File,
    workerId: number,
  ): Promise<PortfolioPictureWithUrl> {
    try {
      // Guardar archivo físico
      const fileInfo = await this.fileUploadService.saveFile(
        file,
        this.FOLDER,        // 'worker_photo'
        'worker',           // entityType
        workerId,
      );

      // Crear registro en BD
      const picture = this.repository.create({
        workerId,
        picture: fileInfo.fileName,
      });

      const saved = await this.repository.save(picture);

      // Retornar con URL
      return {
        ...saved,
        pictureUrl: fileInfo.fileUrl,
      };
    } catch (error) {
      this.logger.error(`Error al crear imagen de portafolio: ${error.message}`, error.stack);
      throw new Error(`No se pudo guardar la imagen: ${error.message}`);
    }
  }

  /**
   * Obtener todas las imágenes de un worker con paginación
   */
  async findAllByWorker(
    workerId: number,
    paginationDto: PaginationDto,
  ): Promise<PaginationResult<PortfolioPictureWithUrl>> {
    const queryBuilder = this.repository
      .createQueryBuilder('picture')
      .where('picture.workerId = :workerId', { workerId })
      .orderBy('picture.createdAt', 'DESC');

    const result = await paginate<PortfolioPictures>(queryBuilder, paginationDto);

    const dataWithUrls = result.data.map(picture => ({
      ...picture,
      pictureUrl: this.fileUploadService.getFileUrl(this.FOLDER, picture.picture),
    }));

    return {
      data: dataWithUrls,
      meta: result.meta,
    };
  }

  /**
   * Obtener una imagen específica (verifica propiedad)
   */
  async findOne(id: number, workerId: number): Promise<PortfolioPictureWithUrl> {
    const picture = await this.repository.findOne({
      where: { id, workerId },
    });

    if (!picture) {
      throw new NotFoundException(`Imagen con ID ${id} no encontrada`);
    }

    return {
      ...picture,
      pictureUrl: this.fileUploadService.getFileUrl(this.FOLDER, picture.picture),
    };
  }

  /**
   * Actualizar/reemplazar una imagen
   */
  async update(
    id: number,
    file: Express.Multer.File,
    workerId: number,
  ): Promise<PortfolioPictureWithUrl> {
    // 1. Verificar que existe y pertenece al worker
    const existing = await this.findOne(id, workerId); // lanza 404 si no existe

    // 2. Eliminar archivo anterior
    this.fileUploadService.deleteFile(this.FOLDER, existing.picture);

    // 3. Guardar nuevo archivo
    const fileInfo = await this.fileUploadService.saveFile(
      file,
      this.FOLDER,
      'worker',
      workerId,
    );

    // 4. Actualizar registro en BD
    existing.picture = fileInfo.fileName;
    const updated = await this.repository.save(existing);

    return {
      ...updated,
      pictureUrl: fileInfo.fileUrl,
    };
  }

  /**
   * Eliminar una imagen (archivo + registro)
   */
  async remove(id: number, workerId: number): Promise<void> {
    const picture = await this.repository.findOne({
      where: { id, workerId },
    });

    if (!picture) {
      throw new NotFoundException(`Imagen con ID ${id} no encontrada`);
    }

    // Eliminar archivo físico
    this.fileUploadService.deleteFile(this.FOLDER, picture.picture);

    // Eliminar registro
    await this.repository.remove(picture);
  }
}
