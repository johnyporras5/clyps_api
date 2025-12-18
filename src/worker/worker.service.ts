import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker } from './entities/worker.entity';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';

@Injectable()
export class WorkerService {
  constructor(
    @InjectRepository(Worker)
    private WorkerRepository: Repository<Worker>,
  ) {}

  async findAll(): Promise<Worker[]> {
    return await this.WorkerRepository.find();
  }

  async findOne(id: number): Promise<Worker> {
    const Worker = await this.WorkerRepository.findOne({ where: { id } });
    if (!Worker) {
      throw new NotFoundException(`Worker with id ${id} not found`);
    }
    return Worker;
  }

  async create(createWorkerDto: CreateWorkerDto): Promise<Worker> {
    const Worker = this.WorkerRepository.create(createWorkerDto);
    return await this.WorkerRepository.save(Worker);
  }

  async update(id: number, updateWorkerDto: UpdateWorkerDto): Promise<Worker> {
    const Worker = await this.WorkerRepository.findOne({ where: { id } });
    if (!Worker) {
      throw new NotFoundException(`Worker with id ${id} not found`);
    }
    
    Object.assign(Worker, updateWorkerDto);
    return await this.WorkerRepository.save(Worker);
  }

  async remove(id: number): Promise<void> {
    const result = await this.WorkerRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Worker with id ${id} not found`);
    }
  }
}
