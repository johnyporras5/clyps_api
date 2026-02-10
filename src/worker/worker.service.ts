import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Inject
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Worker } from './entities/worker.entity';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { User } from '../user/entities/user.entity';
import { FindAllWorkersDto } from './dto/find-all-workers.dto';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Company } from '../company/entities/company.entity';
import { FileUploadService, AllowedFolder } from '../common/services/file_upload.service';
import { PhotoWithUrl } from '../worker/types/photo_with_url.type';
import { WorkerFeedback } from 'src/worker_feedback/entities/worker_feedback.entity';
import { FeedbackSummary } from './types/feedback_summary.type';
@Injectable()
export class WorkerService {
  private readonly WORKER_PHOTO_FOLDER: AllowedFolder = 'worker_photo';

  constructor(
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(WorkerFeedback) // <<-- agregar
  private workerFeedbackRepository: Repository<WorkerFeedback>,
    @Inject(FileUploadService)
    private fileUploadService: FileUploadService,
  ) { }


async findOne(id: number, userId?: number, userType?: string): Promise<PhotoWithUrl & { feedbackSummary?: FeedbackSummary }> {
  const worker = await this.workerRepository.findOne({
    where: { id },
    relations: ['user']
  });

  if (!worker) {
    throw new NotFoundException(`Worker with id ${id} not found`);
  }

  if (userId && userType) {
    if (userType !== 'adm' && worker.userId !== userId) {
      throw new UnauthorizedException('No tienes permiso para ver este perfil');
    }
  }

  const photoUrl = await this.getWorkerPhotoUrl(worker.id);
  const userWithoutPassword = this.excludePasswordFromUser(worker.user);
  const feedbackSummary = await this.getFeedbackSummary(worker.id, 5);

  return {
    ...worker,
    photoUrl,
    user: userWithoutPassword,
    feedbackSummary,
  };
}

async findByUserId(userId: number): Promise<PhotoWithUrl & { feedbackSummary?: FeedbackSummary }> {
  const worker = await this.workerRepository.findOne({
    where: { userId },
    relations: ['user']
  });

  if (!worker) {
    throw new NotFoundException(`Worker profile for user ${userId} not found`);
  }
  const photoUrl = await this.getWorkerPhotoUrl(worker.id);
  const userWithoutPassword = this.excludePasswordFromUser(worker.user);
  const feedbackSummary = await this.getFeedbackSummary(worker.id, 5);

  return {
    ...worker,
    photoUrl, 
    user: userWithoutPassword,
    feedbackSummary,
  };
}

  async create(createWorkerDto: CreateWorkerDto): Promise<Worker> {
    // Verificar que el usuario existe y es de tipo 'wrk'
    const user = await this.userRepository.findOne({
      where: { id: createWorkerDto.userId }
    });

    if (!user) {
      throw new NotFoundException(`User with id ${createWorkerDto.userId} not found`);
    }

    if (user.userType !== 'wrk') {
      throw new BadRequestException('User must be of type worker');
    }

    // Verificar que no exista ya un worker para este usuario
    const existingWorker = await this.workerRepository.findOne({
      where: { userId: createWorkerDto.userId }
    });

    if (existingWorker) {
      throw new ConflictException('Worker profile already exists for this user');
    }

    const worker = this.workerRepository.create(createWorkerDto);
    return await this.workerRepository.save(worker);
  }

  async update(id: number, updateWorkerDto: UpdateWorkerDto, userId: number): Promise<Worker> {
    const worker = await this.workerRepository.findOne({
      where: { id },
      relations: ['user']
    });

    if (!worker) {
      throw new NotFoundException(`Worker with id ${id} not found`);
    }

    // Verificar que el usuario autenticado sea el dueño del perfil
    if (worker.userId !== userId) {
      throw new UnauthorizedException('No tienes permiso para actualizar este perfil');
    }

    Object.assign(worker, updateWorkerDto);
    return await this.workerRepository.save(worker);
  }

  /**
    * Actualizar perfil del trabajador con posibilidad de subir foto
    * @param userId ID del usuario trabajador
    * @param updateWorkerDto Datos a actualizar
    * @param photoFile Archivo de foto (opcional)
    * @returns Trabajador actualizado
    */
  async updateProfileWithPhoto(
    userId: number,
    updateWorkerDto: UpdateWorkerDto,
    photoFile?: Express.Multer.File,
  ): Promise<Worker> {
    // 1. Buscar el trabajador por userId
    const worker = await this.workerRepository.findOne({
      where: { userId },
      relations: ['user']
    });

    if (!worker) {
      throw new NotFoundException(`Perfil de trabajador para el usuario ${userId} no encontrado`);
    }

    // 2. Procesar foto si se proporciona
    if (photoFile) {
      try {
        // Guardar la nueva foto
        const photoInfo = await this.fileUploadService.saveFile(
          photoFile,
          this.WORKER_PHOTO_FOLDER,
          'worker',
          userId
        );

        // Eliminar la foto anterior si existe
        if (worker.picture) {
          await this.fileUploadService.deleteFile(
            this.WORKER_PHOTO_FOLDER,
            worker.picture
          );
        }

        // Actualizar el nombre del archivo en el DTO
        updateWorkerDto.picture = photoInfo.fileName;
      } catch (error) {
        console.error('Error al guardar la foto:', error);
        throw new BadRequestException('Error al guardar la foto del perfil');
      }
    }

    // 3. Actualizar campos del trabajador (excluyendo userId y campos protegidos)
    const allowedFields = [
      'name',
      'lastName',
      'phone',
      'address',
      'birthdate',
      'picture',
      'description',
      'location',
      'isActive'
    ];

    // Filtrar solo los campos permitidos
    const updates: Partial<Worker> = {};
    Object.keys(updateWorkerDto).forEach(key => {
      if (allowedFields.includes(key) && updateWorkerDto[key] !== undefined) {
        updates[key] = updateWorkerDto[key];
      }
    });

    // 4. Advertencia si se intentó modificar campos restringidos
    const restrictedFields = ['id', 'userId', 'user'];
    const attemptedRestrictedUpdates = Object.keys(updateWorkerDto).filter(
      key => restrictedFields.includes(key) && updateWorkerDto[key] !== undefined
    );

    if (attemptedRestrictedUpdates.length > 0) {
      console.warn('Intento de modificación de campos restringidos ignorado:', attemptedRestrictedUpdates);
    }

    // 5. Aplicar actualizaciones y guardar
    Object.assign(worker, updates);
    return await this.workerRepository.save(worker);
  }

  /**
   * Obtener URL completa de la foto del trabajador
   * @param workerId ID del trabajador
   * @returns URL completa de la foto
   */
  async getWorkerPhotoUrl(workerId: number): Promise<string> {
    const worker = await this.workerRepository.findOne({
      where: { id: workerId }
    });

    if (!worker) {
      throw new NotFoundException(`Trabajador con ID ${workerId} no encontrado`);
    }

    if (!worker.picture) {
      return '';
    }

    return this.fileUploadService.getFileUrl(
      this.WORKER_PHOTO_FOLDER,
      worker.picture
    );
  }



  async remove(id: number): Promise<void> {
    const result = await this.workerRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Worker with id ${id} not found`);
    }
  }

  // Método para verificar si un usuario es dueño del worker
  async isWorkerOwner(workerId: number, userId: number): Promise<boolean> {
    const worker = await this.workerRepository.findOne({
      where: { id: workerId, userId: userId }
    });

    return !!worker;
  }

  /**
   * Método auxiliar para excluir la contraseña del objeto usuario
   * @param user Objeto usuario (puede ser undefined)
   * @returns Objeto usuario sin contraseña o undefined
   */
  private excludePasswordFromUser(user?: User): any | undefined {
    if (!user) {
      return undefined;
    }

    // Crear un nuevo objeto con todas las propiedades excepto password
    const { password, ...userWithoutPassword } = user;

    return userWithoutPassword;
  }


  private async getFeedbackSummary(workerId: number, recentLimit = 5): Promise<FeedbackSummary> {
  // total y últimos reviews
  const [recentReviews, totalReviews] = await this.workerFeedbackRepository.findAndCount({
    where: { workerId },
    order: { datetime: 'DESC' },
    take: recentLimit,
  });

  // average usando query builder (más preciso en SQL)
  const raw = await this.workerFeedbackRepository
    .createQueryBuilder('f')
    .select('AVG(f.stars)', 'avg')
    .where('f.worker_id = :workerId', { workerId })
    .getRawOne();

  const averageStars = raw && raw.avg ? parseFloat(raw.avg) : 0;

  return {
    averageStars: Math.round((averageStars + Number.EPSILON) * 100) / 100, // 2 decimales
    totalReviews,
    recentReviews,
  };
}
}