import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Service } from './entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Worker } from '../worker/entities/worker.entity';
import { paginate, PaginationOptions, PaginationResult } from '../common/utils/pagination.util';
import { ServiceCategory } from '../service_category/entities/service_category.entity';
import { ServiceOffer } from '../Offer/entities/service-offer.entity';

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
    @InjectRepository(ServiceCategory)
    private categoryRepository: Repository<ServiceCategory>,
    @InjectRepository(ServiceOffer)
    private serviceOfferRepository: Repository<ServiceOffer>,

  ) { }

  /**
    * Obtener todos los servicios de una compañía con información completa de workers (paginado)
    */
  async findAllByCompanyWithWorkers(
    adminId: number,
    paginationOptions: PaginationOptions
  ): Promise<PaginationResult<any>> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Crear query builder para servicios filtrados por compañía
    const queryBuilder = this.serviceRepository
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.category', 'category')
      .where('service.companyId = :companyId', { companyId: company.id });

    // 3. Aplicar paginación
    const paginatedServices = await paginate<Service>(queryBuilder, paginationOptions);

    // 4. Enriquecer cada servicio con información de workers
    const enrichedData = await Promise.all(
      paginatedServices.data.map(async (service) => {
        const workersInfo = await this.getWorkersInfoForService(service.workers, company.id);
        return {
          ...service,
          workersInfo
        };
      })
    );

    // 5. Devolver resultado paginado con datos enriquecidos
    return {
      ...paginatedServices,
      data: enrichedData
    };
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
  private async getWorkersInfoForService(workersAssignments: Array<{ id: number, percentage: number }>, companyId: number): Promise<any[]> {
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

    // 3. Eliminar service_offers relacionados
    await this.serviceOfferRepository.delete({ serviceId: id });

    // 4. Eliminar el servicio
    const result = await this.serviceRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Service with id ${id} not found`);
    }
  }

  /**
   * Inactivar un servicio (solo administradores)
   */
  async inactivate(id: number, adminId: number): Promise<any> {
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

    // 3. Inactivar el servicio
    service.status = 0; // INACTIVE
    await this.serviceRepository.save(service);

    // 4. Devolver el servicio actualizado con información de workers
    return await this.findOneWithWorkers(id, adminId);
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