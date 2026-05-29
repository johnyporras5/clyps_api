import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { Service } from '../service/entities/service.entity';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import {
  FileUploadService,
  AllowedFolder,
} from '../common/services/file_upload.service';

@Injectable()
export class ReportsService {
  private readonly WORKER_PHOTO_FOLDER: AllowedFolder = 'worker_photo';

  constructor(
    @InjectRepository(SessionDetail)
    private sessionDetailRepository: Repository<SessionDetail>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @Inject(FileUploadService)
    private fileUploadService: FileUploadService,
  ) {}

  async getIncomeByServices(
    adminId: number,
    startDate: string,
    endDate: string,
    page: number = 1,
    limit: number = 10,
  ) {
    // 1. Verificar que el admin tenga compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    // 2. Obtener los servicios de la compañía
    const services = await this.serviceRepository.find({
      where: { companyId: company.id },
    });

    const serviceIds = services.map((s) => s.id);

    if (serviceIds.length === 0) {
      return {
        summary: {
          totalIncome: 0,
          totalServices: 0,
          currency: services[0]?.currency || 'USD',
        },
        services: [],
        meta: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    // 3. Consultar ingresos agrupados por servicio (todos para calcular summary)
    const allResults = await this.sessionDetailRepository
      .createQueryBuilder('sd')
      .select('sd.service_id', 'serviceId')
      .addSelect('SUM(sd.cost)', 'totalIncome')
      .addSelect('COUNT(*)', 'servicesCount')
      .where('sd.service_id IN (:...serviceIds)', { serviceIds })
      .andWhere('sd.start_datetime BETWEEN :startDate AND :endDate', {
        startDate: `${startDate} 00:00:00`,
        endDate: `${endDate} 23:59:59`,
      })
      .andWhere('sd.status = :paid', { paid: 4 })
      .groupBy('sd.service_id')
      .orderBy('totalIncome', 'DESC')
      .getRawMany();

    // 4. Calcular totales generales
    const totalIncome = allResults.reduce(
      (sum, r) => sum + parseFloat(r.totalIncome || '0'),
      0,
    );
    const totalServices = allResults.reduce(
      (sum, r) => sum + parseInt(r.servicesCount || '0'),
      0,
    );

    // 5. Paginar resultados
    const total = allResults.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedResults = allResults.slice(skip, skip + limit);

    // 6. Mapear servicios con nombre y porcentaje
    const serviceMap = new Map(services.map((s) => [s.id, s]));

    const servicesResponse = paginatedResults.map((r) => {
      const service = serviceMap.get(parseInt(r.serviceId));
      const income = parseFloat(r.totalIncome || '0');
      return {
        serviceId: parseInt(r.serviceId),
        serviceName: service?.name || 'Servicio eliminado',
        totalIncome: parseFloat(income.toFixed(2)),
        servicesCount: parseInt(r.servicesCount),
        percentage:
          totalIncome > 0
            ? parseFloat(((income / totalIncome) * 100).toFixed(2))
            : 0,
        currency: service?.currency || services[0]?.currency || 'USD',
      };
    });

    return {
      summary: {
        totalIncome: parseFloat(totalIncome.toFixed(2)),
        totalServices,
        currency: services[0]?.currency || 'USD',
      },
      services: servicesResponse,
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

  async getIncomeByEmployees(
    adminId: number,
    startDate: string,
    endDate: string,
    page: number = 1,
    limit: number = 10,
  ) {
    // 1. Verificar que el admin tenga compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    // 2. Obtener los workers de la compañía
    const companyWorkers = await this.companyWorkerRepository.find({
      where: { companyId: company.id },
      relations: ['worker'],
    });

    const workerIds = companyWorkers.map((cw) => cw.id);

    if (workerIds.length === 0) {
      return {
        summary: {
          totalIncome: 0,
          totalServices: 0,
          currency: 'USD',
        },
        employees: [],
        meta: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    // 3. Obtener currency de los servicios de la compañía
    const firstService = await this.serviceRepository.findOne({
      where: { companyId: company.id },
    });
    const currency = firstService?.currency || 'USD';

    // 4. Consultar ingresos agrupados por empleado (todos para calcular summary)
    const allResults = await this.sessionDetailRepository
      .createQueryBuilder('sd')
      .select('sd.company_worker_id', 'companyWorkerId')
      .addSelect('SUM(sd.cost)', 'totalIncome')
      .addSelect('COUNT(*)', 'servicesCount')
      .where('sd.company_worker_id IN (:...workerIds)', { workerIds })
      .andWhere('sd.start_datetime BETWEEN :startDate AND :endDate', {
        startDate: `${startDate} 00:00:00`,
        endDate: `${endDate} 23:59:59`,
      })
      .andWhere('sd.status = :paid', { paid: 4 })
      .groupBy('sd.company_worker_id')
      .orderBy('totalIncome', 'DESC')
      .getRawMany();

    // 5. Calcular totales generales
    const totalIncome = allResults.reduce(
      (sum, r) => sum + parseFloat(r.totalIncome || '0'),
      0,
    );
    const totalServices = allResults.reduce(
      (sum, r) => sum + parseInt(r.servicesCount || '0'),
      0,
    );

    // 6. Paginar resultados
    const total = allResults.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedResults = allResults.slice(skip, skip + limit);

    // 7. Mapear empleados con nombre, imagen y porcentaje
    const workerMap = new Map(companyWorkers.map((cw) => [cw.id, cw]));

    const employeesResponse = paginatedResults.map((r) => {
      const cw = workerMap.get(parseInt(r.companyWorkerId));
      const income = parseFloat(r.totalIncome || '0');
      const workerName = cw?.worker
        ? `${cw.worker.name || ''} ${cw.worker.lastName || ''}`.trim()
        : 'Empleado eliminado';
      return {
        companyWorkerId: parseInt(r.companyWorkerId),
        name: workerName,
        image: cw?.worker?.picture
          ? this.fileUploadService.getFileUrl(
              this.WORKER_PHOTO_FOLDER,
              cw.worker.picture,
            )
          : null,
        totalIncome: parseFloat(income.toFixed(2)),
        servicesCount: parseInt(r.servicesCount),
        percentage:
          totalIncome > 0
            ? parseFloat(((income / totalIncome) * 100).toFixed(2))
            : 0,
        currency,
      };
    });

    return {
      summary: {
        totalIncome: parseFloat(totalIncome.toFixed(2)),
        totalServices,
        currency,
      },
      employees: employeesResponse,
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
