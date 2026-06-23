import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Service } from './entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Worker } from '../worker/entities/worker.entity';
import {
  paginate,
  PaginationOptions,
  PaginationResult,
} from '../common/utils/pagination.util';
import { ServiceCategory } from '../service_category/entities/service_category.entity';
import { ServiceOffer } from '../Offer/entities/service-offer.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { CalendarCompany } from '../calendar_company/entities/calendar-company.entity';
import { CompanyFeedback } from '../company_feedback/entities/company_feedback.entity';
import { WorkerFeedback } from '../worker_feedback/entities/worker_feedback.entity';
import {
  FileUploadService,
  AllowedFolder,
} from '../common/services/file_upload.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ServiceNotificationEmitter } from './service-notification.emitter';
import { companyRoom, companyPublicRoom } from '../realtime/rooms';

@Injectable()
export class ServiceService {
  private readonly WORKER_PHOTO_FOLDER: AllowedFolder = 'worker_photo';

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
    @InjectRepository(SessionDetail)
    private sessionDetailRepository: Repository<SessionDetail>,
    @InjectRepository(CalendarCompany)
    private calendarCompanyRepository: Repository<CalendarCompany>,
    @InjectRepository(CompanyFeedback)
    private companyFeedbackRepository: Repository<CompanyFeedback>,
    @InjectRepository(WorkerFeedback)
    private workerFeedbackRepository: Repository<WorkerFeedback>,
    @Inject(FileUploadService)
    private fileUploadService: FileUploadService,
    private readonly realtime: RealtimeService,
    private readonly serviceNotifications: ServiceNotificationEmitter,
  ) {}

  /**
   * Emite un evento de servicio a las rooms company:<id> + company-public:<id>
   * (CLYP-244). El servicio no contiene datos de cliente → seguro para el canal
   * público.
   */
  private emitServiceEvent(
    type: string,
    entityId: number,
    companyId: number,
    data: unknown,
  ): void {
    this.realtime.emitEntity(
      [companyRoom(companyId), companyPublicRoom(companyId)],
      {
        type,
        entityId,
        companyId,
        data,
      },
    );
  }

  /**
   * Obtener todos los servicios de una compañía con información completa de workers (paginado)
   */
  async findAllByCompanyWithWorkers(
    adminId: number,
    paginationOptions: PaginationOptions & { name?: string; status?: string },
  ): Promise<PaginationResult<any>> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Crear query builder para servicios filtrados por compañía
    const queryBuilder = this.serviceRepository
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.category', 'category')
      .where('service.companyId = :companyId', { companyId: company.id });

    // 2.b Filtro por nombre (igual que /workers): LIKE sobre service.name
    if (paginationOptions.name && paginationOptions.name.trim() !== '') {
      queryBuilder.andWhere('service.name LIKE :search', {
        search: `%${paginationOptions.name.trim()}%`,
      });
    }

    // 2.c Filtro por estado: '1' = activo, '0' = inactivo, ausente = todos
    if (paginationOptions.status !== undefined) {
      queryBuilder.andWhere('service.status = :status', {
        status: parseInt(paginationOptions.status, 10),
      });
    }

    // 3. Aplicar paginación
    const paginatedServices = await paginate<Service>(
      queryBuilder,
      paginationOptions,
    );

    // 4. Enriquecer cada servicio con información de workers
    const enrichedData = await Promise.all(
      paginatedServices.data.map(async (service) => {
        const workersInfo = await this.getWorkersInfoForService(
          service.workers,
          company.id,
        );
        return {
          ...service,
          workersInfo,
        };
      }),
    );

    // 5. Devolver resultado paginado con datos enriquecidos
    return {
      ...paginatedServices,
      data: enrichedData,
    };
  }
  /**
   * Obtener todos los servicios ACTIVOS de una compañía por ID, con info de workers (paginado).
   * Accesible para admin, worker y cliente (no requiere pertenencia).
   */
  async findAllByCompanyIdWithWorkers(
    companyId: number,
    paginationOptions: PaginationOptions,
  ): Promise<PaginationResult<any> & { company: any }> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with id ${companyId} not found`);
    }

    const queryBuilder = this.serviceRepository
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.category', 'category')
      .where('service.companyId = :companyId', { companyId })
      .andWhere('service.status = 1');

    const paginatedServices = await paginate<Service>(
      queryBuilder,
      paginationOptions,
    );

    const enrichedData = await Promise.all(
      paginatedServices.data.map(async (service) => {
        const workersInfo = await this.getWorkersInfoForService(
          service.workers,
          companyId,
        );
        return { ...service, workersInfo };
      }),
    );

    const calendar = await this.calendarCompanyRepository.findOne({
      where: { companyId },
    });

    let schedule: any = null;
    if (calendar?.calendarDetail) {
      let detail = calendar.calendarDetail;
      if (typeof detail === 'string') {
        try {
          detail = JSON.parse(detail);
        } catch {
          /* ignore */
        }
      }
      schedule = detail;
    }

    const companyRatingRaw = await this.companyFeedbackRepository
      .createQueryBuilder('f')
      .select('AVG(f.stars)', 'avg')
      .addSelect('COUNT(f.id)', 'count')
      .where('f.company_id = :companyId', { companyId })
      .andWhere('f.stars IS NOT NULL')
      .getRawOne<{ avg: string; count: string }>();

    const companyRating =
      companyRatingRaw && companyRatingRaw.avg
        ? {
            average: Number(Number(companyRatingRaw.avg).toFixed(2)),
            total: Number(companyRatingRaw.count),
          }
        : { average: 0, total: 0 };

    const companyInfo = {
      id: company.id,
      name: company.name,
      location: company.location,
      address: company.address,
      email: company.email,
      description: company.description,
      managerName: company.managerName,
      phone: company.phone,
      instagramUrl: company.instagramUrl,
      tiktokUrl: company.tiktokUrl,
      facebookUrl: company.facebookUrl,
      logo: company.logo,
      logoUrl: company.logo
        ? this.fileUploadService.getFileUrl('company_logo', company.logo)
        : null,
      schedule,
      rating: companyRating,
    };

    return { company: companyInfo, ...paginatedServices, data: enrichedData };
  }

  /**
   * Obtener un servicio específico con información de workers
   */
  async findOneWithWorkers(id: number, adminId: number): Promise<any> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Buscar el servicio que pertenezca a la compañía del admin
    const service = await this.serviceRepository.findOne({
      where: {
        id: id,
        companyId: company.id,
      },
    });

    if (!service) {
      throw new NotFoundException(
        `Service with id ${id} not found or you don't have permission`,
      );
    }

    // 3. Obtener información de workers
    const workersInfo = await this.getWorkersInfoForService(
      service.workers,
      company.id,
    );

    return {
      ...service,
      workersInfo,
    };
  }

  /**
   * Obtener un servicio con workers accesible para admin, worker o cliente.
   * - Admin: debe pertenecer a su compañía (mismo chequeo que findOneWithWorkers).
   * - Worker/Cliente: puede consultarlo sin restricción de propiedad.
   */
  async findOneWithWorkersForUser(
    id: number,
    userId: number,
    userType: string,
  ): Promise<any> {
    if (userType === 'adm') {
      return this.findOneWithWorkers(id, userId);
    }

    const service = await this.serviceRepository.findOne({ where: { id } });
    if (!service) {
      throw new NotFoundException(`Service with id ${id} not found`);
    }

    const workersInfo = await this.getWorkersInfoForService(
      service.workers,
      service.companyId,
    );

    return {
      ...service,
      workersInfo,
    };
  }

  /**
   * Obtener los workers activos asignados a un servicio por ID.
   * - Admin: debe pertenecer a su compañía.
   * - Worker/Cliente: puede consultarlo sin restricción de propiedad.
   */
  async findWorkersByServiceId(
    serviceId: number,
    userId: number,
    userType: string,
  ): Promise<{
    serviceId: number;
    serviceName: string;
    standardTime: number;
    currency?: string;
    workers: Array<{
      companyWorkerId: number;
      workerId: number;
      fullName: string;
      pictureURL: string;
      averageRating: string;
      time: number;
      percentage: number;
    }>;
  }> {
    const service = await this.serviceRepository.findOne({
      where: { id: serviceId },
    });
    if (!service) {
      throw new NotFoundException(`Service with id ${serviceId} not found`);
    }

    if (userType === 'adm') {
      const company = await this.companyRepository.findOne({
        where: { userId: userId },
      });
      if (!company) {
        throw new UnauthorizedException('No tienes una compañía asignada');
      }
      if (service.companyId !== company.id) {
        throw new NotFoundException(
          `Service with id ${serviceId} not found or you don't have permission`,
        );
      }
    }

    const assignments = service.workers || [];
    let workers: Array<{
      companyWorkerId: number;
      workerId: number;
      fullName: string;
      pictureURL: string;
      averageRating: string;
      time: number;
      percentage: number;
    }> = [];

    if (assignments.length > 0) {
      const companyWorkerIds = assignments.map((w) => w.id);

      const rows = await this.companyWorkerRepository
        .createQueryBuilder('cw')
        .innerJoin('cw.worker', 'worker')
        .leftJoin('worker_feedback', 'wf', 'wf.worker_id = worker.id')
        .select([
          'cw.id AS companyWorkerId',
          'worker.id AS workerId',
          'worker.name AS fullName',
          'worker.picture AS picture',
          'COALESCE(AVG(wf.stars), 0) AS averageRating',
        ])
        .where('cw.id IN (:...ids)', { ids: companyWorkerIds })
        .andWhere('cw.companyId = :companyId', { companyId: service.companyId })
        .andWhere('cw.isActive = 1')
        .groupBy('worker.id')
        .addGroupBy('cw.id')
        .getRawMany();

      workers = assignments
        .map((assignment) => {
          const row = rows.find(
            (r: any) => Number(r.companyWorkerId) === assignment.id,
          );
          if (!row) return null;

          const pictureURL = row.picture
            ? this.fileUploadService.getFileUrl(
                this.WORKER_PHOTO_FOLDER,
                row.picture,
              )
            : '';

          return {
            companyWorkerId: Number(row.companyWorkerId),
            workerId: Number(row.workerId),
            fullName: row.fullName,
            pictureURL,
            averageRating: parseFloat(row.averageRating).toFixed(1),
            time:
              typeof assignment.time === 'number'
                ? assignment.time
                : service.standardTime,
            percentage: assignment.percentage,
          };
        })
        .filter((w): w is NonNullable<typeof w> => w !== null);
    }

    return {
      serviceId: service.id,
      serviceName: service.name,
      standardTime: service.standardTime,
      currency: service.currency,
      workers,
    };
  }

  /**
   * Obtener información completa de workers asignados a un servicio
   */
  private async getWorkersInfoForService(
    workersAssignments: Array<{ id: number; percentage: number }>,
    companyId: number,
  ): Promise<any[]> {
    if (!workersAssignments || workersAssignments.length === 0) {
      return [];
    }

    // Extraer solo los IDs para la consulta
    const workerIds = workersAssignments.map((w) => w.id);

    // Obtener información de company_worker con relaciones
    const companyWorkers = await this.companyWorkerRepository
      .createQueryBuilder('cw')
      .innerJoinAndSelect('cw.worker', 'worker')
      .innerJoinAndSelect('worker.user', 'user')
      .where('cw.id IN (:...ids)', { ids: workerIds })
      .andWhere('cw.companyId = :companyId', { companyId: companyId })
      .andWhere('cw.isActive = 1')
      .getMany();

    // Obtener ratings agregados por worker
    const workerEntityIds = companyWorkers
      .map((cw) => cw.worker?.id)
      .filter((wid): wid is number => typeof wid === 'number');

    const workerRatingMap = new Map<
      number,
      { average: number; total: number }
    >();
    if (workerEntityIds.length > 0) {
      const workerRatings = await this.workerFeedbackRepository
        .createQueryBuilder('f')
        .select('f.worker_id', 'workerId')
        .addSelect('AVG(f.stars)', 'avg')
        .addSelect('COUNT(f.id)', 'count')
        .where('f.worker_id IN (:...ids)', { ids: workerEntityIds })
        .andWhere('f.stars IS NOT NULL')
        .groupBy('f.worker_id')
        .getRawMany<{ workerId: number; avg: string; count: string }>();

      for (const r of workerRatings) {
        workerRatingMap.set(Number(r.workerId), {
          average: Number(Number(r.avg).toFixed(2)),
          total: Number(r.count),
        });
      }
    }

    // Combinar la información de la base de datos con los porcentajes del servicio
    return workersAssignments.map((workerAssignment) => {
      const companyWorker = companyWorkers.find(
        (cw) => cw.id === workerAssignment.id,
      );

      if (!companyWorker) {
        return {
          id: workerAssignment.id,
          percentage: workerAssignment.percentage,
          error: 'Worker not found or not active',
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
          lastLogout: companyWorker.worker.user.lastLogout,
        },
        workerInfo: {
          id: companyWorker.worker.id,
          name: companyWorker.worker.name,
          picture: companyWorker.worker.picture,
          pictureUrl: companyWorker.worker.picture
            ? this.fileUploadService.getFileUrl(
                this.WORKER_PHOTO_FOLDER,
                companyWorker.worker.picture,
              )
            : null,
          phone: companyWorker.worker.phone,
          address: companyWorker.worker.address,
          rating: workerRatingMap.get(companyWorker.worker.id) || {
            average: 0,
            total: 0,
          },
        },
        companyWorkerInfo: {
          startDate: companyWorker.startDate,
          endDate: companyWorker.endDate,
          isActive: companyWorker.isActive,
          servicesDetail: companyWorker.servicesDetail,
          calendar: companyWorker.calendar,
        },
      };
    });
  }

  /**
   * Crear un servicio (solo administradores)
   * Valida que los workers asignados pertenezcan a la compañía del admin
   */
  async create(
    createServiceDto: CreateServiceDto,
    adminId: number,
  ): Promise<any> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Validar workers si se proporcionan
    if (createServiceDto.workers && createServiceDto.workers.length > 0) {
      await this.validateWorkersBelongToCompany(
        createServiceDto.workers,
        company.id,
      );
    }

    // 3. Crear el servicio con el companyId del administrador
    const serviceData = {
      ...createServiceDto,
      companyId: company.id,
      workers: createServiceDto.workers || [],
    };

    const service = this.serviceRepository.create(serviceData);
    const savedService = await this.serviceRepository.save(service);

    // 4. Obtener el servicio con información de workers
    const full = await this.findOneWithWorkers(savedService.id, adminId);
    this.emitServiceEvent('service.created', full.id, full.companyId, full);
    // Notificar a los workers asignados al crear (todos son nuevos).
    await this.serviceNotifications.notifyAssigned(
      full.id,
      full.name,
      (createServiceDto.workers || []).map((w) => w.id),
      adminId,
    );
    return full;
  }

  /**
   * Actualizar un servicio (solo administradores)
   */
  async update(
    id: number,
    updateServiceDto: UpdateServiceDto,
    adminId: number,
  ): Promise<any> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Buscar el servicio que pertenezca a la compañía del admin
    const service = await this.serviceRepository.findOne({
      where: {
        id: id,
        companyId: company.id,
      },
    });

    if (!service) {
      throw new NotFoundException(
        `Service with id ${id} not found or you don't have permission`,
      );
    }

    // 3. Validar workers si se proporcionan en la actualización
    if (updateServiceDto.workers && updateServiceDto.workers.length > 0) {
      await this.validateWorkersBelongToCompany(
        updateServiceDto.workers,
        company.id,
      );
    }

    // workers asignados ANTES de actualizar (para detectar los nuevos).
    const previousWorkerIds = new Set(
      (service.workers || []).map((w) => w.id),
    );

    // 4. Actualizar el servicio
    Object.assign(service, updateServiceDto);
    await this.serviceRepository.save(service);

    // 5. Devolver el servicio actualizado con información de workers
    const full = await this.findOneWithWorkers(id, adminId);
    this.emitServiceEvent('service.updated', full.id, full.companyId, full);
    // Notificar SOLO a los workers recién agregados (si se enviaron workers).
    if (updateServiceDto.workers) {
      const added = updateServiceDto.workers
        .map((w) => w.id)
        .filter((wid) => !previousWorkerIds.has(wid));
      await this.serviceNotifications.notifyAssigned(
        full.id,
        full.name,
        added,
        adminId,
      );
    }
    return full;
  }

  /**
   * Eliminar un servicio (solo administradores)
   */
  async remove(id: number, adminId: number): Promise<void> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Buscar el servicio que pertenezca a la compañía del admin
    const service = await this.serviceRepository.findOne({
      where: {
        id: id,
        companyId: company.id,
      },
    });

    if (!service) {
      throw new NotFoundException(
        `Service with id ${id} not found or you don't have permission`,
      );
    }

    // 3. Verificar que el servicio no tenga sessions asociadas
    const sessionDetailCount = await this.sessionDetailRepository.count({
      where: { serviceId: id },
    });

    if (sessionDetailCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar el servicio porque tiene sesiones asociadas',
      );
    }

    // 4. Eliminar service_offers relacionados
    await this.serviceOfferRepository.delete({ serviceId: id });

    // 5. Eliminar el servicio
    const result = await this.serviceRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Service with id ${id} not found`);
    }

    this.emitServiceEvent('service.deleted', id, service.companyId, {
      serviceId: id,
    });
  }

  /**
   * Inactivar un servicio (solo administradores)
   */
  async inactivate(id: number, adminId: number): Promise<any> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Buscar el servicio que pertenezca a la compañía del admin
    const service = await this.serviceRepository.findOne({
      where: {
        id: id,
        companyId: company.id,
      },
    });

    if (!service) {
      throw new NotFoundException(
        `Service with id ${id} not found or you don't have permission`,
      );
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
    companyId: number,
  ): Promise<void> {
    if (!workers || workers.length === 0) return;

    const workerIds = workers.map((w) => w.id);

    const validCompanyWorkers = await this.companyWorkerRepository.find({
      where: {
        id: In(workerIds),
        companyId: companyId,
        isActive: 1,
      },
      select: ['id'],
    });

    const validIds = validCompanyWorkers.map((cw) => cw.id);
    const invalidIds = workerIds.filter((id) => !validIds.includes(id));

    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Los siguientes workers no pertenecen a tu compañía o no están activos: ${invalidIds.join(', ')}`,
      );
    }

    // Validar que los porcentajes sean válidos
    workers.forEach((worker) => {
      if (worker.percentage < 0 || worker.percentage > 100) {
        throw new BadRequestException(
          `El porcentaje para el worker ${worker.id} debe estar entre 0 y 100`,
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
