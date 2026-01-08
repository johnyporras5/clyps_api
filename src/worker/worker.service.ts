import { 
  Injectable, 
  NotFoundException, 
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ConflictException // Agregar esto
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker } from './entities/worker.entity';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { User } from '../user/entities/user.entity';

@Injectable()
export class WorkerService {
  constructor(
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<Worker[]> {
    return await this.workerRepository.find({
      relations: ['user']
    });
  }

  async findOne(id: number, userId?: number, userType?: string): Promise<Worker> {
    const worker = await this.workerRepository.findOne({ 
      where: { id },
      relations: ['user']
    });
    
    if (!worker) {
      throw new NotFoundException(`Worker with id ${id} not found`);
    }

    // Si se proporciona userId y userType, verificar permisos
    if (userId && userType) {
      // Admin puede ver cualquier worker
      if (userType !== 'adm' && worker.userId !== userId) {
        throw new UnauthorizedException('No tienes permiso para ver este perfil');
      }
    }

    return worker;
  }

  async findByUserId(userId: number): Promise<Worker> {
    const worker = await this.workerRepository.findOne({ 
      where: { userId },
      relations: ['user']
    });
    
    if (!worker) {
      throw new NotFoundException(`Worker profile for user ${userId} not found`);
    }

    return worker;
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

  async updateByUserId(userId: number, updateWorkerDto: UpdateWorkerDto): Promise<Worker> {
    const worker = await this.workerRepository.findOne({ 
      where: { userId },
      relations: ['user']
    });
    
    if (!worker) {
      throw new NotFoundException(`Worker profile for user ${userId} not found`);
    }

    Object.assign(worker, updateWorkerDto);
    return await this.workerRepository.save(worker);
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
}