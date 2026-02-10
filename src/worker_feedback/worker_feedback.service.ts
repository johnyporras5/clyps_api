import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { WorkerFeedback } from './entities/worker_feedback.entity';
import { CreateWorkerFeedbackDto } from './dto/create-worker_feedback.dto';
import { UpdateWorkerFeedbackDto } from './dto/update-worker_feedback.dto';
import { Worker } from '../worker/entities/worker.entity';

@Injectable()
export class WorkerFeedbackService {
  constructor(
    @InjectRepository(WorkerFeedback)
    private workerFeedbackRepository: Repository<WorkerFeedback>,

    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
  ) {}

  async findAll(): Promise<WorkerFeedback[]> {
    return await this.workerFeedbackRepository.find({ order: { datetime: 'DESC' } });
  }

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

  /**
   * Listar feedbacks por worker con paginación simple
   */
  async findByWorker(workerId: number, page = 1, limit = 10): Promise<{ data: WorkerFeedback[]; meta: any }> {
    const worker = await this.workerRepository.findOne({ where: { id: workerId } });
    if (!worker) {
      throw new NotFoundException(`Worker with id ${workerId} not found`);
    }

    const skip = (page - 1) * limit;
    const [data, total] = await this.workerFeedbackRepository.findAndCount({
      where: { workerId },
      order: { datetime: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }


  
}
