import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ConflictException // Agregar esto
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

@Injectable()
export class WorkerService {
  constructor(
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
  ) { }

  // Método para admin: puede filtrar por companyId o ver todos
  async findAll(query: FindAllWorkersDto): Promise<PaginationResult<Worker>> {
    const { page, limit, companyId, search, isActive } = query;

    // Si no se especifica companyId, mostrar todos los workers
    if (!companyId) {
      const whereConditions: any = {};

      if (search) {
        whereConditions.name = Like(`%${search}%`);
      }

      // Filtro por isActive de la tabla worker
      if (isActive !== undefined) {
        whereConditions.isActive = Number(isActive);
      }

      return paginate<Worker>(
        this.workerRepository,
        { page, limit },
        whereConditions,
        ['user']
      );
    }

    // Si se especifica companyId, usar QueryBuilder para el join
    const queryBuilder = this.workerRepository
      .createQueryBuilder('worker')
      .leftJoinAndSelect('worker.user', 'user')
      .innerJoin(
        'company_worker',
        'cw',
        'cw.worker_id = worker.id AND cw.company_id = :companyId',
        { companyId }
      );

    // **NUEVO: SIEMPRE filtrar por worker.is_active = 1 cuando hay companyId**
    queryBuilder.andWhere('worker.is_active = :workerActive', {
      workerActive: 1
    });

    // Aplicar filtro de estado activo en CompanyWorker
    if (isActive !== undefined) {
      const isActiveValue = Number(isActive);
      queryBuilder.andWhere('cw.is_active = :cwActive', {
        cwActive: isActiveValue
      });
    }

    // Aplicar búsqueda por texto
    if (search) {
      queryBuilder.andWhere(
        '(worker.name LIKE :search OR worker.last_name LIKE :search OR user.email LIKE :search)',
        { search: `%${search}%` }
      );
    }

    return paginate<Worker>(queryBuilder, { page, limit });
  }

  // Método para administradores de compañía: solo ven los workers de su compañía
  async findAllWithCompanyFilter(
    query: FindAllWorkersDto,
    adminId: number
  ): Promise<PaginationResult<Worker>> {
    // Obtener la compañía del administrador
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // Forzar el filtro por la compañía del administrador
    const queryWithCompany = {
      ...query,
      companyId: company.id
    };

    return this.findAll(queryWithCompany);
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