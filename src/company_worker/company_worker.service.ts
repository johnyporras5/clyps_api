import { Injectable, NotFoundException,UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyWorker } from './entities/company_worker.entity';
import { Company } from '../company/entities/company.entity';
import { CreateCompanyWorkerDto } from './dto/create-company_worker.dto';
import { UpdateCompanyWorkerDto } from './dto/update-company_worker.dto';

@Injectable()
export class CompanyWorkerService {
  constructor(
     @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>, 
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
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

// company_worker.service.ts

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


}
