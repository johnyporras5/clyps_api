import { Injectable, NotFoundException, UnauthorizedException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyWorker } from './entities/company_worker.entity';
import { Company } from '../company/entities/company.entity';
import { CreateCompanyWorkerDto } from './dto/create-company_worker.dto';
import { UpdateCompanyWorkerDto } from './dto/update-company_worker.dto';
import { Worker } from '../worker/entities/worker.entity';
import { WorkerFeedback } from '../worker_feedback/entities/worker_feedback.entity';
import { WorkerList, PaginatedWorkerListResult } from './interface/worker-list.interface';
import { CompanyWorkersPaginationDto } from './dto/company-workers-pagination.dto';
import { PaginationOptions } from '../common/utils/pagination.util';
import { FileUploadService, AllowedFolder } from '../common/services/file_upload.service';

@Injectable()
export class CompanyWorkerService {
  private readonly WORKER_PHOTO_FOLDER: AllowedFolder = 'worker_photo';

  constructor(
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    @InjectRepository(WorkerFeedback)
    private workerFeedbackRepository: Repository<WorkerFeedback>,
    @Inject(FileUploadService)
    private fileUploadService: FileUploadService,
  ) { }

  async findAll(): Promise<CompanyWorker[]> {
    return await this.companyWorkerRepository.find();
  }

  async findOne(id: number): Promise<CompanyWorker> {
    const companyWorker = await this.companyWorkerRepository.findOne({ where: { id } });
    if (!companyWorker) {
      throw new NotFoundException(`CompanyWorker with id ${id} not found`);
    }
    return companyWorker;
  }

  async create(createCompanyWorkerDto: CreateCompanyWorkerDto): Promise<CompanyWorker> {
    const companyWorker = this.companyWorkerRepository.create(createCompanyWorkerDto);
    return await this.companyWorkerRepository.save(companyWorker);
  }

  /**
   * Modificar trabajador de la compañía (solo administradores)
   * Solo permite actualizar calendar e isActive
   * @param workerId ID del trabajador
   * @param adminId ID del administrador
   * @param updateData Datos a actualizar
   * @returns Trabajador actualizado
   */
  async updateWorkerInCompany(
    workerId: number,
    adminId: number,
    updateData: UpdateCompanyWorkerDto
  ): Promise<CompanyWorker> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Buscar la asignación específica por workerId y companyId
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: {
        workerId: workerId,
        companyId: company.id
      }
    });

    if (!companyWorker) {
      throw new NotFoundException('Este trabajador no está asignado a tu compañía');
    }

    // 3. Crear objeto solo con los campos permitidos (calendar e isActive)
    const allowedUpdates: Partial<CompanyWorker> = {};

    // Solo actualizar calendar si viene en el updateData
    if (updateData.calendar !== undefined) {
      allowedUpdates.calendar = updateData.calendar;
    }

    // Solo actualizar isActive si viene en el updateData
    if (updateData.isActive !== undefined) {
      allowedUpdates.isActive = updateData.isActive;
    }

    // 4. Advertencia si se intentó modificar otros campos
    const restrictedFields = ['companyId', 'workerId', 'userId', 'startDate', 'endDate', 'role', 'createdAt', 'updatedAt'];
    const attemptedRestrictedUpdates = Object.keys(updateData).filter(
      key => restrictedFields.includes(key) && updateData[key] !== undefined
    );

    if (attemptedRestrictedUpdates.length > 0) {
      console.warn('Intento de modificación de campos restringidos ignorado:', attemptedRestrictedUpdates);
    }

    // 5. Actualizar solo los campos permitidos
    Object.assign(companyWorker, allowedUpdates);

    return await this.companyWorkerRepository.save(companyWorker);
  }

  /**
   * Modificar trabajador por ID de usuario
   * Solo permite actualizar calendar e isActive
   * @param userId ID del usuario trabajador
   * @param adminId ID del administrador
   * @param updateData Datos a actualizar
   */
  async updateWorkerByUserId(
    userId: number,
    adminId: number,
    updateData: UpdateCompanyWorkerDto
  ): Promise<CompanyWorker> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('Solo Administradores pueden modificar trabajadores');
    }

    // 2. Buscar por userId en lugar de workerId
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: {
        userId: userId,
        companyId: company.id
      }
    });

    if (!companyWorker) {
      throw new NotFoundException('Este trabajador no está asignado a tu compañía');
    }

    // 3. Crear objeto solo con los campos permitidos (calendar e isActive)
    const allowedUpdates: Partial<CompanyWorker> = {};

    // Solo actualizar calendar si viene en el updateData
    if (updateData.calendar !== undefined) {
      allowedUpdates.calendar = updateData.calendar;
    }

    // Solo actualizar isActive si viene en el updateData
    if (updateData.isActive !== undefined) {
      allowedUpdates.isActive = updateData.isActive;
    }

    // 4. Advertencia si se intentó modificar otros campos
    const restrictedFields = ['companyId', 'workerId', 'userId', 'startDate', 'endDate', 'role', 'createdAt', 'updatedAt'];
    const attemptedRestrictedUpdates = Object.keys(updateData).filter(
      key => restrictedFields.includes(key) && updateData[key] !== undefined
    );

    if (attemptedRestrictedUpdates.length > 0) {
      console.warn('Intento de modificación de campos restringidos ignorado:', attemptedRestrictedUpdates);
    }

    // 5. Actualizar
    Object.assign(companyWorker, allowedUpdates);

    return await this.companyWorkerRepository.save(companyWorker);
  }

  /**
   * Eliminar trabajador de la compañía (solo de company_worker)
   * @param workerId ID del trabajador (id de la tabla worker)
   * @param adminId ID del administrador que realiza la acción
   * @returns Mensaje de confirmación
   */
  async removeWorkerFromCompany(
    workerId: number,
    adminId: number
  ): Promise<{ message: string }> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Buscar la asignación específica por workerId y companyId
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: {
        workerId: workerId,
        companyId: company.id
      }
    });

    if (!companyWorker) {
      throw new NotFoundException('Este trabajador no está asignado a tu compañía');
    }

    // 3. Eliminar el registro
    await this.companyWorkerRepository.delete(companyWorker.id);

    return {
      message: `Trabajador eliminado exitosamente de la compañía '${company.name}'. El trabajador mantiene su cuenta y perfil.`
    };
  }

  /**
   * Desactivar trabajador por ID de usuario
   * @param userId ID del usuario trabajador
   * @param adminId ID del administrador
   */
  async removeWorkerByUserId(
    userId: number,
    adminId: number
  ): Promise<{ message: string }> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('Solo Administradores pueden desactivar trabajadores');
    }

    const companyWorker = await this.companyWorkerRepository.findOne({
      where: {
        userId: userId,
        companyId: company.id
      }
    });

    if (!companyWorker) {
      throw new NotFoundException('Este trabajador no está asignado a tu compañía');
    }

    // En lugar de eliminar, actualizamos isActive a 0
    companyWorker.isActive = 0;
    companyWorker.endDate = new Date(); // Opcional: establecer fecha de finalización
    await this.companyWorkerRepository.save(companyWorker);

    return {
      message: `Trabajador desactivado exitosamente de la compañía '${company.name}'.`
    };
  }

  /**
    * Método paginado usando la función de utilidad paginate
    */
  async getCompanyWorkersWithNameFilterPaginated(
    adminId: number,
    paginationDto: CompanyWorkersPaginationDto,
  ): Promise<PaginatedWorkerListResult> {
    // 1. Obtener la compañía del administrador
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    // 2. Extraer page, limit, name e isActive del DTO
    const { page, limit, name, isActive } = paginationDto;

    // 3. Crear QueryBuilder con alias correctos
    const queryBuilder = this.workerRepository
      .createQueryBuilder('worker')
      .innerJoin('company_worker', 'cw', 'cw.worker_id = worker.id')
      .leftJoin('worker_feedback', 'wf', 'wf.worker_id = worker.id')
      .select([
        'cw.id AS companyWorkerId',
        'worker.id AS workerId',
        "CONCAT(worker.name, ' ', worker.last_name) AS fullName",
        'worker.picture AS picture',
        'cw.start_date AS startDate',
        'cw.end_date AS endDate',
        'cw.is_active AS isActive',
        'cw.temporarily_deleted AS temporarilyDeleted',
        'cw.permanently_deleted AS permanentlyDeleted',
      'COALESCE(AVG(wf.stars), 0) AS averageRating',
        'COUNT(wf.id) AS totalReviews'
      ])
      .where('cw.company_id = :companyId', { companyId: company.id })
      .andWhere('cw.temporarily_deleted = 0')
      .andWhere('cw.permanently_deleted = 0')
      .groupBy('worker.id')
      .addGroupBy('cw.id')
      .orderBy('worker.name', 'ASC');

    // Filtrar por isActive si se proporciona (0 = inactivos, 1 = activos), si no se envía devuelve todos
    if (isActive !== undefined) {
      queryBuilder.andWhere('cw.is_active = :isActive', { isActive: parseInt(isActive) });
    }

    // 4. Aplicar filtro por nombre si se proporciona
    if (name && name.trim() !== '') {
      const searchTerm = `%${name.trim()}%`;
      queryBuilder.andWhere(
        "(worker.name LIKE :search OR worker.last_name LIKE :search OR CONCAT(worker.name, ' ', worker.last_name) LIKE :search)",
        { search: searchTerm }
      );
    }

    // 5. Usar la función paginate
    const paginationOptions: PaginationOptions = {
      page: page,
      limit: limit
    };

    // 6. Paginar los resultados
    const paginatedResult = await this.paginateQueryBuilder<WorkerList>(
      queryBuilder,
      paginationOptions,
      company.id,
      name,
      isActive
    );

    // 7. Formatear los datos y construir las URLs completas
    const formattedData: WorkerList[] = paginatedResult.data.map((result: any) => {
      // Obtener la URL completa de la imagen
      let pictureURL = '';
      if (result.picture) {
        pictureURL = this.fileUploadService.getFileUrl(this.WORKER_PHOTO_FOLDER, result.picture);
      }

      return {
        companyWorkerId: result.companyWorkerId,
        workerId: result.workerId,
        fullName: result.fullName,
        picture: result.picture, // Nombre original del archivo
        pictureURL: pictureURL, // URL completa
       averageRating: parseFloat(result.averageRating).toFixed(1), 
      totalReviews: parseInt(result.totalReviews) || 0, 
        startDate: result.startDate,
        endDate: result.endDate,
        isActive: result.isActive,
        temporarilyDeleted: result.temporarilyDeleted,
        permanentlyDeleted: result.permanentlyDeleted
      };
    });

    return {
      data: formattedData,
      meta: paginatedResult.meta
    };
  }

  /**
   * Función auxiliar para paginar un QueryBuilder (corregida)
   */
  private async paginateQueryBuilder<T>(
    queryBuilder: any,
    options: PaginationOptions,
    companyId: number,
    name?: string,
    isActive?: string
  ): Promise<{ data: T[]; meta: any }> {
    const { page, limit } = options;
    const skip = (page - 1) * limit;

    // 1. Obtener los datos paginados
    const data = await queryBuilder
      .skip(skip)
      .take(limit)
      .getRawMany();

    // 2. Crear una consulta de conteo separada
    const countQueryBuilder = this.workerRepository
      .createQueryBuilder('worker')
      .innerJoin('company_worker', 'cw', 'cw.worker_id = worker.id')
      .where('cw.company_id = :companyId', { companyId })
      .andWhere('cw.temporarily_deleted = 0')
      .andWhere('cw.permanently_deleted = 0');

    // Aplicar filtro por isActive si existe
    if (isActive !== undefined) {
      countQueryBuilder.andWhere('cw.is_active = :isActive', { isActive: parseInt(isActive) });
    }

    // Aplicar filtro por nombre si existe
    if (name && name.trim() !== '') {
      const searchTerm = `%${name.trim()}%`;
      countQueryBuilder.andWhere(
        "(worker.name LIKE :search OR worker.last_name LIKE :search OR CONCAT(worker.name, ' ', worker.last_name) LIKE :search)",
        { search: searchTerm }
      );
    }

    // Contar trabajadores únicos
    const totalResult = await countQueryBuilder
      .select('COUNT(DISTINCT worker.id)', 'count')
      .getRawOne();

    const total = totalResult ? parseInt(totalResult.count, 10) : 0;

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      data: data as T[],
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }
}