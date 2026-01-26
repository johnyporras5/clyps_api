import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Service } from './entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Worker } from '../worker/entities/worker.entity';

@Injectable()
export class ServiceService {
  constructor(
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
  ) {}

  /**
   * Obtener todos los servicios de una compañía con información completa de workers
   */
  async findAllByCompanyWithWorkers(adminId: number): Promise<any[]> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Obtener servicios de la compañía del administrador
    const services = await this.serviceRepository.find({
      where: { companyId: company.id }
    });

    // 3. Enriquecer cada servicio con información de workers
    const servicesWithWorkers = await Promise.all(
      services.map(async (service) => {
        const workersInfo = await this.getWorkersInfoForService(service.workers, company.id);
        return {
          ...service,
          workersInfo
        };
      })
    );

    return servicesWithWorkers;
  }

  /**
   * Obtener un servicio específico con información de workers
   */
  async findOneWithWorkers(id: number, adminId: number): Promise<any> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Buscar el servicio que pertenezca a la compañía del admin
    const service = await this.serviceRepository.findOne({
      where: { 
        id: id,
        companyId: company.id 
      }
    });

    if (!service) {
      throw new NotFoundException(`Service with id ${id} not found or you don't have permission`);
    }

    // 3. Obtener información de workers
    const workersInfo = await this.getWorkersInfoForService(service.workers, company.id);

    return {
      ...service,
      workersInfo
    };
  }

  /**
   * Obtener información completa de workers asignados a un servicio
   */
  private async getWorkersInfoForService(workersAssignments: Array<{id: number, percentage: number}>, companyId: number): Promise<any[]> {
    if (!workersAssignments || workersAssignments.length === 0) {
      return [];
    }

    // Extraer solo los IDs para la consulta
    const workerIds = workersAssignments.map(w => w.id);

    // Obtener información de company_worker con relaciones
    const companyWorkers = await this.companyWorkerRepository
      .createQueryBuilder('cw')
      .innerJoinAndSelect('cw.worker', 'worker')
      .innerJoinAndSelect('worker.user', 'user')
      .where('cw.id IN (:...ids)', { ids: workerIds })
      .andWhere('cw.companyId = :companyId', { companyId: companyId })
      .andWhere('cw.isActive = 1')
      .getMany();

    // Combinar la información de la base de datos con los porcentajes del servicio
    return workersAssignments.map(workerAssignment => {
      const companyWorker = companyWorkers.find(cw => cw.id === workerAssignment.id);
      
      if (!companyWorker) {
        return {
          id: workerAssignment.id,
          percentage: workerAssignment.percentage,
          error: 'Worker not found or not active'
        };
      }

      return {
        companyWorkerId: companyWorker.id,
        percentage: workerAssignment.percentage,
        workerId: companyWorker.worker.id,
        userId: companyWorker.worker.user.id,
        userInfo: {
          id: companyWorker.worker.user.id,
          username: companyWorker.worker.user.username,
          email: companyWorker.worker.user.email,
          userType: companyWorker.worker.user.userType,
          emailVerified: companyWorker.worker.user.emailVerified,
          lastLogin: companyWorker.worker.user.lastLogin,
          lastLogout: companyWorker.worker.user.lastLogout
        },
        workerInfo: {
          id: companyWorker.worker.id,
          name: companyWorker.worker.name,
          lastName: companyWorker.worker.lastName,
          picture: companyWorker.worker.picture,
          phone: companyWorker.worker.phone,
          address: companyWorker.worker.address,
        },
        companyWorkerInfo: {
          startDate: companyWorker.startDate,
          endDate: companyWorker.endDate,
          isActive: companyWorker.isActive,
          servicesDetail: companyWorker.servicesDetail,
          calendar: companyWorker.calendar
        }
      };
    });
  }

  /**
   * Crear un servicio (solo administradores)
   * Valida que los workers asignados pertenezcan a la compañía del admin
   */
  async create(createServiceDto: CreateServiceDto, adminId: number): Promise<any> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Validar workers si se proporcionan
    if (createServiceDto.workers && createServiceDto.workers.length > 0) {
      await this.validateWorkersBelongToCompany(createServiceDto.workers, company.id);
    }

    // 3. Crear el servicio con el companyId del administrador
    const serviceData = {
      ...createServiceDto,
      companyId: company.id,
      workers: createServiceDto.workers || []
    };

    const service = this.serviceRepository.create(serviceData);
    const savedService = await this.serviceRepository.save(service);

    // 4. Obtener el servicio con información de workers
    return await this.findOneWithWorkers(savedService.id, adminId);
  }

  /**
   * Actualizar un servicio (solo administradores)
   */
  async update(id: number, updateServiceDto: UpdateServiceDto, adminId: number): Promise<any> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Buscar el servicio que pertenezca a la compañía del admin
    const service = await this.serviceRepository.findOne({
      where: { 
        id: id,
        companyId: company.id 
      }
    });

    if (!service) {
      throw new NotFoundException(`Service with id ${id} not found or you don't have permission`);
    }

    // 3. Validar workers si se proporcionan en la actualización
    if (updateServiceDto.workers && updateServiceDto.workers.length > 0) {
      await this.validateWorkersBelongToCompany(updateServiceDto.workers, company.id);
    }

    // 4. Actualizar el servicio
    Object.assign(service, updateServiceDto);
    await this.serviceRepository.save(service);

    // 5. Devolver el servicio actualizado con información de workers
    return await this.findOneWithWorkers(id, adminId);
  }

  /**
   * Eliminar un servicio (solo administradores)
   */
  async remove(id: number, adminId: number): Promise<void> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Buscar el servicio que pertenezca a la compañía del admin
    const service = await this.serviceRepository.findOne({
      where: { 
        id: id,
        companyId: company.id 
      }
    });

    if (!service) {
      throw new NotFoundException(`Service with id ${id} not found or you don't have permission`);
    }

    // 3. Eliminar el servicio
    const result = await this.serviceRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Service with id ${id} not found`);
    }
  }

  /**
   * Validar que los workers pertenecen a la compañía del administrador
   */
  private async validateWorkersBelongToCompany(
    workers: Array<{ id: number; percentage: number }>, 
    companyId: number
  ): Promise<void> {
    if (!workers || workers.length === 0) return;

    const workerIds = workers.map(w => w.id);

    const validCompanyWorkers = await this.companyWorkerRepository.find({
      where: {
        id: In(workerIds),
        companyId: companyId,
        isActive: 1
      },
      select: ['id']
    });

    const validIds = validCompanyWorkers.map(cw => cw.id);
    const invalidIds = workerIds.filter(id => !validIds.includes(id));

    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Los siguientes workers no pertenecen a tu compañía o no están activos: ${invalidIds.join(', ')}`
      );
    }

    // Validar que los porcentajes sean válidos
    workers.forEach(worker => {
      if (worker.percentage < 0 || worker.percentage > 100) {
        throw new BadRequestException(
          `El porcentaje para el worker ${worker.id} debe estar entre 0 y 100`
        );
      }
    });
  }

  /**
   * Obtener servicios asignados a un trabajador específico (para trabajadores)
   */
  async findServicesByWorker(userId: number): Promise<any[]> {
    // 1. Buscar el worker asociado al usuario
    const worker = await this.workerRepository.findOne({
      where: { userId: userId },
      relations: ['user']
    });

    if (!worker) {
      throw new NotFoundException('Worker not found for this user');
    }

    // 2. Buscar el company_worker activo para este trabajador
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: { 
        workerId: worker.id,
        isActive: 1 
      }
    });

    if (!companyWorker) {
      throw new UnauthorizedException('No estás asignado a una compañía activa');
    }

    // 3. Buscar servicios que tengan asignado a este worker (company_worker.id)
    // Usamos JSON_SEARCH para buscar en el array de objetos
    const services = await this.serviceRepository
      .createQueryBuilder('service')
      .where('service.companyId = :companyId', { companyId: companyWorker.companyId })
      .andWhere('JSON_SEARCH(service.workers, "one", :workerId, NULL, "$[*].id") IS NOT NULL', {
        workerId: companyWorker.id.toString()
      })
      .getMany();

    // 4. Enriquecer con información de los services
    return await Promise.all(
      services.map(async (service) => {
        const workersInfo = await this.getWorkersInfoForService(service.workers, companyWorker.companyId);
        return {
          ...service,
          workersInfo
        };
      })
    );
  }

  /**
   * Métodos auxiliares (opcional, para compatibilidad)
   */
  async findAll(): Promise<Service[]> {
    return await this.serviceRepository.find();
  }

  async findOne(id: number): Promise<Service> {
    const service = await this.serviceRepository.findOne({ where: { id } });
    if (!service) {
      throw new NotFoundException(`Service with id ${id} not found`);
    }
    return service;
  }
}