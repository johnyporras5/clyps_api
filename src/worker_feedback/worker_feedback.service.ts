import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkerFeedback } from './entities/worker_feedback.entity';
import { CreateWorkerFeedbackDto } from './dto/create-worker_feedback.dto';
import { UpdateWorkerFeedbackDto } from './dto/update-worker_feedback.dto';

@Injectable()
export class WorkerFeedbackService {
  constructor(
    @InjectRepository(WorkerFeedback)
    private WorkerFeedbackRepository: Repository<WorkerFeedback>,
  ) {}

  async findAll(): Promise<WorkerFeedback[]> {
    return await this.WorkerFeedbackRepository.find();
  }

  async findOne(id: number): Promise<WorkerFeedback> {
    const WorkerFeedback = await this.WorkerFeedbackRepository.findOne({ where: { id } });
    if (!WorkerFeedback) {
      throw new NotFoundException(`WorkerFeedback with id ${id} not found`);
    }
    return WorkerFeedback;
  }

  async create(createWorkerFeedbackDto: CreateWorkerFeedbackDto): Promise<WorkerFeedback> {
    const WorkerFeedback = this.WorkerFeedbackRepository.create(createWorkerFeedbackDto);
    return await this.WorkerFeedbackRepository.save(WorkerFeedback);
  }

  async update(id: number, updateWorkerFeedbackDto: UpdateWorkerFeedbackDto): Promise<WorkerFeedback> {
    const WorkerFeedback = await this.WorkerFeedbackRepository.findOne({ where: { id } });
    if (!WorkerFeedback) {
      throw new NotFoundException(`WorkerFeedback with id ${id} not found`);
    }
    
    Object.assign(WorkerFeedback, updateWorkerFeedbackDto);
    return await this.WorkerFeedbackRepository.save(WorkerFeedback);
  }

  async remove(id: number): Promise<void> {
    const result = await this.WorkerFeedbackRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`WorkerFeedback with id ${id} not found`);
    }
  }
}
