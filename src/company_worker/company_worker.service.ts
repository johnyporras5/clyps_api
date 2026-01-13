import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyWorker } from './entities/company_worker.entity';
import { Company } from '../company/entities/company.entity';
import { CreateCompanyWorkerDto } from './dto/create-company_worker.dto';
import { UpdateCompanyWorkerDto } from './dto/update-company_worker.dto';
import { Worker } from '../worker/entities/worker.entity';
import { WorkerFeedback } from '../worker_feedback/entities/worker_feedback.entity';


@Injectable()
export class CompanyWorkerService {
  constructor(
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    @InjectRepository(WorkerFeedback)
    private workerFeedbackRepository: Repository<WorkerFeedback>,
  ) { }

  async findAll(): Promise<CompanyWorker[]> {
    return await this.companyWorkerRepository.find();
  }

  async findOne(id: number): Promise<CompanyWorker> {
    const CompanyWorker = await this.companyWorkerRepository.findOne({ where: { id } });
    if (!CompanyWorker) {
      throw new NotFoundException(`CompanyWorker with id ${id} not found`);
    }
    return CompanyWorker;
  }

  async create(createCompanyWorkerDto: CreateCompanyWorkerDto): Promise<CompanyWorker> {
    const CompanyWorker = this.companyWorkerRepository.create(createCompanyWorkerDto);
    return await this.companyWorkerRepository.save(CompanyWorker);
  }


  /**
   * Modificar trabajador de la compañía (solo administradores)
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

    // 3. Verificar que no se intenta modificar campos sensibles
    const { companyId, workerId: dtoWorkerId, userId, ...safeUpdateData } = updateData;

    // Opcional: Emitir advertencia si se intentó modificar campos restringidos
    if (companyId !== undefined || dtoWorkerId !== undefined || userId !== undefined) {
      console.warn('Intento de modificación de campos restringidos ignorado:', { companyId, dtoWorkerId, userId });
    }

    // 4. Actualizar solo los campos permitidos
    Object.assign(companyWorker, safeUpdateData);

    return await this.companyWorkerRepository.save(companyWorker);
  }

  /**
   * Modificar trabajador por ID de usuario
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

    // 3. Filtrar campos sensibles
    const { companyId: dtoCompanyId, workerId, userId: dtoUserId, ...safeUpdateData } = updateData;

    if (dtoCompanyId !== undefined || workerId !== undefined || dtoUserId !== undefined) {
      console.warn('Intento de modificación de campos restringidos ignorado:', { dtoCompanyId, workerId, dtoUserId });
    }

    // 4. Actualizar
    Object.assign(companyWorker, safeUpdateData);

    return await this.companyWorkerRepository.save(companyWorker);
  }

  /**
   * Desactivar trabajador de la compañía (cambia isActive a 0)
   * @param workerId ID del trabajador (id de la tabla worker)
   * @param adminId ID del administrador que realiza la acción
   * @returns Mensaje de confirmación
   */
  async removeWorkerFromCompany(
    workerId: number,
    adminId: number
  ): Promise<{ message: string }> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }

    const companyWorker = await this.companyWorkerRepository.findOne({
      where: {
        workerId: workerId,
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
 * Método simple usando QueryBuilder de TypeORM correctamente
 */
async getCompanyWorkersWithNameFilter(
  adminId: number, 
  name?: string
): Promise<any[]> {
  // 1. Obtener la compañía del administrador
  const company = await this.companyRepository.findOne({
    where: { userId: adminId }
  });

  if (!company) {
    throw new UnauthorizedException('No tienes una compañía asignada');
  }

  // 2. Crear QueryBuilder con alias correctos
  const queryBuilder = this.workerRepository
    .createQueryBuilder('worker')
    .innerJoin('company_worker', 'cw', 'cw.worker_id = worker.id')
    .leftJoin('worker_feedback', 'wf', 'wf.worker_id = worker.id')
    .select([
      'cw.id AS companyWorkerId',
      'worker.id AS workerId',
      'CONCAT(worker.name, " ", worker.last_name) AS fullName',
      'worker.picture AS picture',
      'cw.start_date AS startDate',
      'cw.end_date AS endDate',
      'cw.is_active AS isActive',
      'COALESCE(AVG(wf.stars), 0) AS averageRating',
      'COUNT(wf.id) AS totalReviews'
    ])
    .where('cw.company_id = :companyId', { companyId: company.id })
    .andWhere('cw.is_active = 1')
    .groupBy('worker.id')
    .addGroupBy('cw.id')
    .orderBy('worker.name', 'ASC');

  // 3. Aplicar filtro por nombre si se proporciona
  if (name && name.trim() !== '') {
    const searchTerm = `%${name.trim()}%`;
    queryBuilder.andWhere(
      '(worker.name LIKE :search OR worker.last_name LIKE :search OR CONCAT(worker.name, " ", worker.last_name) LIKE :search)',
      { search: searchTerm }
    );
  }

  // 4. Ejecutar y formatear resultados
  const results = await queryBuilder.getRawMany();

  return results.map(result => ({
    companyWorkerId: result.companyWorkerId,
    workerId: result.workerId,
    fullName: result.fullName,
    picture: result.picture,
    averageRating: parseFloat(result.averageRating).toFixed(1),
    totalReviews: parseInt(result.totalReviews) || 0,
    startDate: result.startDate,
    endDate: result.endDate,
    isActive: result.isActive
  }));
}
}
