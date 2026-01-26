import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
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
   * Eliminar trabajador por ID de usuario (alternativa)
   * @param userId ID del usuario trabajador
   * @param adminId ID del administrador
   */
  async removeWorkerByUserId(
    userId: number,
    adminId: number
  ): Promise<{ message: string }> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new UnauthorizedException('Solo Administradores pueden Eliminar trabajadores');
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

    // 3. Eliminar el registro
    await this.companyWorkerRepository.delete(companyWorker.id);

    return {
      message: `Trabajador eliminado exitosamente de la compañía '${company.name}'.`
    };
  }
}