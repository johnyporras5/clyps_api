import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortfolioPictures } from './entities/portfolio_pictures.entity';
import { CompanyPortfolioPictures } from './entities/company_portfolio_pictures.entity';
import { Worker } from '../worker/entities/worker.entity';
import { Company } from '../company/entities/company.entity';
import { FileUploadService } from '../common/services/file_upload.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { PortfolioPictureWithUrl } from './types/portfolio-picture-with-url.type';
import { CompanyPortfolioPictureWithUrl } from './types/company-portfolio-picture-with-url.type';

@Injectable()
export class PortfolioPicturesService {
  private readonly logger = new Logger(PortfolioPicturesService.name);
  private readonly FOLDER = 'portfolio';

  constructor(
    @InjectRepository(PortfolioPictures)
    private repository: Repository<PortfolioPictures>,
    @InjectRepository(CompanyPortfolioPictures)
    private companyPortfolioRepository: Repository<CompanyPortfolioPictures>,
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    private fileUploadService: FileUploadService,
  ) {}

  /**
   * Resuelve el `worker.id` real a partir del `user.id` (sub del JWT).
   * El token JWT contiene el id del usuario, no el del trabajador.
   */
  private async resolveWorkerIdFromUser(userId: number): Promise<number> {
    const worker = await this.workerRepository.findOne({
      where: { userId },
      select: ['id'],
    });

    if (!worker) {
      throw new NotFoundException(
        `No se encontró un perfil de worker para el usuario ${userId}`,
      );
    }

    return worker.id;
  }

  /**
   * Subir una nueva imagen al portafolio del trabajador autenticado
   */
  async create(
    file: Express.Multer.File,
    userId: number,
  ): Promise<PortfolioPictureWithUrl> {
    try {
      const workerId = await this.resolveWorkerIdFromUser(userId);

      // Guardar archivo físico
      const fileInfo = await this.fileUploadService.saveFile(
        file,
        this.FOLDER,
        'worker',
        workerId,
      );

      // Crear registro en BD
      const picture = this.repository.create({
        workerId,
        picture: fileInfo.fileName,
      });

      const saved = await this.repository.save(picture);

      return {
        ...saved,
        pictureUrl: fileInfo.fileUrl,
      };
    } catch (error) {
      this.logger.error(
        `Error al crear imagen de portafolio: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Obtener todas las imágenes del trabajador autenticado con paginación
   */
  async findAllByUser(
    userId: number,
    paginationDto: PaginationDto,
  ): Promise<PaginationResult<PortfolioPictureWithUrl>> {
    const workerId = await this.resolveWorkerIdFromUser(userId);
    return this.findAllByWorker(workerId, paginationDto);
  }

  /**
   * Obtener todas las imágenes de un worker (por workerId real) con paginación.
   * Útil para perfiles públicos donde ya se conoce el workerId.
   */
  async findAllByWorker(
    workerId: number,
    paginationDto: PaginationDto,
  ): Promise<PaginationResult<PortfolioPictureWithUrl>> {
    const queryBuilder = this.repository
      .createQueryBuilder('picture')
      .where('picture.workerId = :workerId', { workerId })
      .orderBy('picture.createdAt', 'DESC');

    const result = await paginate<PortfolioPictures>(
      queryBuilder,
      paginationDto,
    );

    const dataWithUrls = result.data.map((picture) => ({
      ...picture,
      pictureUrl: this.fileUploadService.getFileUrl(
        this.FOLDER,
        picture.picture,
      ),
    }));

    return {
      data: dataWithUrls,
      meta: result.meta,
    };
  }

  /**
   * Obtener una imagen específica (verifica propiedad por usuario autenticado)
   */
  async findOne(id: number, userId: number): Promise<PortfolioPictureWithUrl> {
    const workerId = await this.resolveWorkerIdFromUser(userId);

    const picture = await this.repository.findOne({
      where: { id, workerId },
    });

    if (!picture) {
      throw new NotFoundException(`Imagen con ID ${id} no encontrada`);
    }

    return {
      ...picture,
      pictureUrl: this.fileUploadService.getFileUrl(
        this.FOLDER,
        picture.picture,
      ),
    };
  }

  /**
   * Actualizar/reemplazar una imagen
   */
  async update(
    id: number,
    file: Express.Multer.File,
    userId: number,
  ): Promise<PortfolioPictureWithUrl> {
    const workerId = await this.resolveWorkerIdFromUser(userId);

    // 1. Verificar que existe y pertenece al worker
    const existing = await this.repository.findOne({
      where: { id, workerId },
    });

    if (!existing) {
      throw new NotFoundException(`Imagen con ID ${id} no encontrada`);
    }

    // 2. Eliminar archivo anterior
    await this.fileUploadService.deleteFile(this.FOLDER, existing.picture);

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
  async remove(id: number, userId: number): Promise<void> {
    const workerId = await this.resolveWorkerIdFromUser(userId);

    const picture = await this.repository.findOne({
      where: { id, workerId },
    });

    if (!picture) {
      throw new NotFoundException(`Imagen con ID ${id} no encontrada`);
    }

    // Eliminar archivo físico
    await this.fileUploadService.deleteFile(this.FOLDER, picture.picture);

    // Eliminar registro
    await this.repository.remove(picture);
  }

  private async resolveCompanyIdFromUser(userId: number): Promise<number> {
    const company = await this.companyRepository.findOne({
      where: { userId },
      select: ['id'],
    });

    if (!company) {
      throw new NotFoundException(
        `No se encontró una compañía para el usuario ${userId}`,
      );
    }

    return company.id;
  }

  async createForCompany(
    file: Express.Multer.File,
    userId: number,
  ): Promise<CompanyPortfolioPictureWithUrl> {
    const companyId = await this.resolveCompanyIdFromUser(userId);

    const fileInfo = await this.fileUploadService.saveFile(
      file,
      this.FOLDER,
      'company',
      companyId,
    );

    const picture = this.companyPortfolioRepository.create({
      companyId,
      picture: fileInfo.fileName,
    });

    const saved = await this.companyPortfolioRepository.save(picture);

    return {
      ...saved,
      pictureUrl: fileInfo.fileUrl,
    };
  }

  async findAllByCompanyUser(
    userId: number,
    paginationDto: PaginationDto,
  ): Promise<PaginationResult<CompanyPortfolioPictureWithUrl>> {
    const companyId = await this.resolveCompanyIdFromUser(userId);
    return this.findAllByCompany(companyId, paginationDto);
  }

  async findAllByCompany(
    companyId: number,
    paginationDto: PaginationDto,
  ): Promise<PaginationResult<CompanyPortfolioPictureWithUrl>> {
    const queryBuilder = this.companyPortfolioRepository
      .createQueryBuilder('picture')
      .where('picture.companyId = :companyId', { companyId })
      .orderBy('picture.createdAt', 'DESC');

    const result = await paginate<CompanyPortfolioPictures>(
      queryBuilder,
      paginationDto,
    );

    const dataWithUrls = result.data.map((picture) => ({
      ...picture,
      pictureUrl: this.fileUploadService.getFileUrl(
        this.FOLDER,
        picture.picture,
      ),
    }));

    return {
      data: dataWithUrls,
      meta: result.meta,
    };
  }

  async updateForCompany(
    id: number,
    file: Express.Multer.File,
    userId: number,
  ): Promise<CompanyPortfolioPictureWithUrl> {
    const companyId = await this.resolveCompanyIdFromUser(userId);

    const existing = await this.companyPortfolioRepository.findOne({
      where: { id, companyId },
    });

    if (!existing) {
      throw new NotFoundException(`Imagen con ID ${id} no encontrada`);
    }

    await this.fileUploadService.deleteFile(this.FOLDER, existing.picture);
    const fileInfo = await this.fileUploadService.saveFile(
      file,
      this.FOLDER,
      'company',
      companyId,
    );

    existing.picture = fileInfo.fileName;
    const updated = await this.companyPortfolioRepository.save(existing);

    return {
      ...updated,
      pictureUrl: fileInfo.fileUrl,
    };
  }

  async removeForCompany(id: number, userId: number): Promise<void> {
    const companyId = await this.resolveCompanyIdFromUser(userId);

    const picture = await this.companyPortfolioRepository.findOne({
      where: { id, companyId },
    });

    if (!picture) {
      throw new NotFoundException(`Imagen con ID ${id} no encontrada`);
    }

    await this.fileUploadService.deleteFile(this.FOLDER, picture.picture);
    await this.companyPortfolioRepository.remove(picture);
  }
}
