import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, SelectQueryBuilder } from 'typeorm';
import { WorkerFeedback } from './entities/worker_feedback.entity';
import { CreateWorkerFeedbackDto } from './dto/create-worker_feedback.dto';
import { UpdateWorkerFeedbackDto } from './dto/update-worker_feedback.dto';
import { Worker } from '../worker/entities/worker.entity';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Company } from 'src/company/entities/company.entity';
import { Client } from 'src/client/entities/client.entity';
import { FileUploadService } from 'src/common/services/file_upload.service';

@Injectable()
export class WorkerFeedbackService {
  constructor(
    @InjectRepository(WorkerFeedback)
    private workerFeedbackRepository: Repository<WorkerFeedback>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    private fileUploadService: FileUploadService,
  ) { }

  async findOne(id: number): Promise<WorkerFeedback> {
    const feedback = await this.workerFeedbackRepository.findOne({ where: { id } });
    if (!feedback) {
      throw new NotFoundException(`WorkerFeedback with id ${id} not found`);
    }
    return feedback;
  }

  /**
   * Crea un feedback para el workerId dado.
   * clientId debe venir del token en el controlador.
   */
  async create(createDto: CreateWorkerFeedbackDto, workerId: number, clientId?: number): Promise<WorkerFeedback> {
    // Validar existencia del worker
    const worker = await this.workerRepository.findOne({ where: { id: workerId } });
    if (!worker) {
      throw new NotFoundException(`Worker with id ${workerId} not found`);
    }

    // Validar stars (class-validator ya lo hace si usas pipes, pero doble-check)
    if (createDto.stars < 1 || createDto.stars > 5) {
      throw new BadRequestException('stars must be between 1 and 5');
    }

    const feedbackData: DeepPartial<WorkerFeedback> = {
      stars: createDto.stars,
      description: createDto.description,
      workerId,
      clientId: clientId ?? null,
    };

    const feedback = this.workerFeedbackRepository.create(feedbackData);
    return await this.workerFeedbackRepository.save(feedback);
  }

  async update(id: number, updateDto: UpdateWorkerFeedbackDto, requesterUserId?: number, requesterUserType?: string): Promise<WorkerFeedback> {
    const feedback = await this.workerFeedbackRepository.findOne({ where: { id } });
    if (!feedback) {
      throw new NotFoundException(`WorkerFeedback with id ${id} not found`);
    }

    // Permisos: solo el autor (clientId) o admin puede actualizar
    if (requesterUserId && feedback.clientId && requesterUserId !== feedback.clientId && requesterUserType !== 'adm') {
      throw new ForbiddenException('No tienes permiso para actualizar este feedback');
    }

    if (updateDto.stars !== undefined && (updateDto.stars < 1 || updateDto.stars > 5)) {
      throw new BadRequestException('stars must be between 1 and 5');
    }

    Object.assign(feedback, updateDto);
    return await this.workerFeedbackRepository.save(feedback);
  }

  async remove(id: number, requesterUserId?: number, requesterUserType?: string): Promise<void> {
    const feedback = await this.workerFeedbackRepository.findOne({ where: { id } });
    if (!feedback) {
      throw new NotFoundException(`WorkerFeedback with id ${id} not found`);
    }

    // Permisos: solo autor o admin puede borrar
    if (requesterUserId && feedback.clientId && requesterUserId !== feedback.clientId && requesterUserType !== 'adm') {
      throw new ForbiddenException('No tienes permiso para eliminar este feedback');
    }

    const result = await this.workerFeedbackRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`WorkerFeedback with id ${id} not found`);
    }
  }

  async findByWorker(
    workerId: number,
    page = 1,
    limit = 10,
  ): Promise<PaginationResult<WorkerFeedback>> {
    // Verificar que el worker existe
    const worker = await this.workerRepository.findOne({ where: { id: workerId } });
    if (!worker) {
      throw new NotFoundException(`Worker with id ${workerId} not found`);
    }

    // Crear query builder con filtro y orden
    const queryBuilder: SelectQueryBuilder<WorkerFeedback> = this.workerFeedbackRepository
      .createQueryBuilder('feedback')
      .where('feedback.workerId = :workerId', { workerId })
      .orderBy('feedback.datetime', 'DESC');

    // Delegar la paginación al helper
    const paginationResult = await paginate<WorkerFeedback>(queryBuilder, { page, limit });

    return paginationResult;
  }


  /**
   * Lista todas las reseñas de los barberos que pertenecen a la compañía del admin autenticado.
   * @param userId - ID del usuario admin (del token)
   * @param page - Número de página
   * @param limit - Elementos por página
   */
  async findAllByAdminCompany(
    userId: number,
    page = 1,
    limit = 10,
  ): Promise<PaginationResult<WorkerFeedback>> {
    // 1. Buscar la compañía asociada al usuario admin
    const company = await this.companyRepository.findOne({ where: { userId } });
    if (!company) {
      throw new NotFoundException(`No company found for user ${userId}`);
    }

    // 2. Subconsulta: obtener todos los workerId de los barberos activos en esa compañía
    const workerIdsSubQuery = this.companyWorkerRepository
      .createQueryBuilder('cw')
      .select('cw.workerId')
      .where('cw.companyId = :companyId', { companyId: company.id })
      .andWhere('cw.permanentlyDeleted = false'); // Opcional: excluir borrados

    // 3. Consulta principal: feedbacks cuyo workerId esté en la subconsulta
    const queryBuilder = this.workerFeedbackRepository
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.worker', 'worker')
      .leftJoinAndMapOne('feedback.client', Client, 'client', 'client.userId = feedback.clientId')
      .where(`feedback.workerId IN (${workerIdsSubQuery.getQuery()})`)
      .setParameters(workerIdsSubQuery.getParameters())
      .orderBy('feedback.datetime', 'DESC');

    // 4. Paginar usando el helper
    const result = await paginate<WorkerFeedback>(queryBuilder, { page, limit });

    // 5. Agregar pictureUrl al cliente
    result.data = result.data.map((feedback) => {
      if (feedback.client?.picture) {
        feedback.client.pictureUrl = this.fileUploadService.getFileUrl('client_photo', feedback.client.picture);
      }
      return feedback;
    });

    return result;
  }

  /**
 * Obtiene todas las reseñas del worker autenticado mediante su userId.
 * @param userId - ID del usuario (extraído del token)
 * @param page - Número de página
 * @param limit - Elementos por página
 */
async findMyFeedbacks(
  userId: number,
  page = 1,
  limit = 10,
): Promise<PaginationResult<WorkerFeedback>> {
  // 1. Buscar el worker asociado al userId
  const worker = await this.workerRepository.findOne({
    where: { userId },
  });

  if (!worker) {
    throw new NotFoundException(
      `No se encontró un perfil de worker para el usuario ${userId}`,
    );
  }

  // 2. Reutilizar el método findByWorker para obtener las reseñas paginadas
  return this.findByWorker(worker.id, page, limit);
}
}
