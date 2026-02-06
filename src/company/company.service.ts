import { Injectable, NotFoundException, Inject ,BadRequestException} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { User } from '../user/entities/user.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { FileUploadService } from '../common/services/file_upload.service';
import { CompanyWithLogoUrl } from './types/company-with-logo-url.type';
import { 
  paginate, 
  PaginationOptions, 
  PaginationResult 
} from '../common/utils/pagination.util';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Client } from '../client/entities/client.entity';


@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @Inject(FileUploadService)
    private fileUploadService: FileUploadService,
  ) { }

  async findAll(
    options: PaginationOptions
  ): Promise<PaginationResult<CompanyWithLogoUrl>> {
    const paginationResult = await paginate(
      this.companyRepository,
      options
    );

    // Transformar los datos para incluir logoUrl
    const dataWithLogoUrl = paginationResult.data.map(company => {
      const companyWithLogo: CompanyWithLogoUrl = {
        ...company,
        logoUrl: company.logo ? this.fileUploadService.getFileUrl('company_logo', company.logo) : null
      };
      return companyWithLogo;
    });

    return {
      ...paginationResult,
      data: dataWithLogoUrl
    };
  }

  async findOne(id: number): Promise<CompanyWithLogoUrl> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
    
    const companyWithLogo: CompanyWithLogoUrl = {
      ...company,
      logoUrl: company.logo ? this.fileUploadService.getFileUrl('company_logo', company.logo) : null
    };
    
    return companyWithLogo;
  }

  async findByUserId(userId: number): Promise<CompanyWithLogoUrl> {
    const company = await this.companyRepository.findOne({
      where: { userId }
    });

    if (!company) {
      throw new NotFoundException(`Company for user with id ${userId} not found`);
    }

    // Obtener los datos del usuario
    const user = await this.userRepository.findOne({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    // Excluir el password del usuario por seguridad
    const { password, ...userWithoutPassword } = user;

    const companyWithLogo: CompanyWithLogoUrl = {
      ...company,
      logoUrl: company.logo ? this.fileUploadService.getFileUrl('company_logo', company.logo) : null,
      user: userWithoutPassword
    };

    return companyWithLogo;
  }

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    const company = this.companyRepository.create(createCompanyDto);
    return await this.companyRepository.save(company);
  }

  async update(id: number, updateCompanyDto: UpdateCompanyDto): Promise<CompanyWithLogoUrl> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }

    Object.assign(company, updateCompanyDto);
    const updatedCompany = await this.companyRepository.save(company);

    const companyWithLogo: CompanyWithLogoUrl = {
      ...updatedCompany,
      logoUrl: updatedCompany.logo ? this.fileUploadService.getFileUrl('company_logo', updatedCompany.logo) : null
    };

    return companyWithLogo;
  }

  async remove(id: number): Promise<void> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
    
    // Eliminar el archivo del logo si existe
    if (company.logo) {
      this.fileUploadService.deleteFile('company_logo', company.logo);
    }
    
    const result = await this.companyRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
  }


   /**
   * Método único para actualizar el perfil del administrador
   * Maneja tanto los datos como el logo en una sola operación
   */
  async updateAdminProfile(
    userId: number,
    updateAdminProfileDto: UpdateAdminProfileDto,
    logoFile?: Express.Multer.File
  ): Promise<CompanyWithLogoUrl> {
    // Buscar la compañía del admin
    const company = await this.companyRepository.findOne({
      where: { userId }
    });

    if (!company) {
      throw new NotFoundException('No se encontró la compañía para este administrador');
    }

    // Si se envía un logo, procesarlo
    if (logoFile) {
      try {
        // Eliminar el logo anterior si existe
        if (company.logo) {
          await this.fileUploadService.deleteFile('company_logo', company.logo);
        }

        // Subir nuevo logo
        const logoInfo = await this.fileUploadService.saveFile(
          logoFile,
          'company_logo',
          'company',
          userId
        );

        // Actualizar el nombre del logo en la compañía
        company.logo = logoInfo.fileName;
      } catch (error) {
        console.error('❌ Error al procesar el logo:', error);
        throw new BadRequestException('Error al procesar el logo. Asegúrate de que sea una imagen válida.');
      }
    }

    // Actualizar campos del DTO
    const updateData: Partial<Company> = {};
    
    // Solo actualizar los campos que vienen en el DTO (no undefined)
    if (updateAdminProfileDto.name !== undefined) updateData.name = updateAdminProfileDto.name;
    if (updateAdminProfileDto.location !== undefined) updateData.location = updateAdminProfileDto.location;
    if (updateAdminProfileDto.email !== undefined) updateData.email = updateAdminProfileDto.email;
    if (updateAdminProfileDto.phone !== undefined) updateData.phone = updateAdminProfileDto.phone;
    if (updateAdminProfileDto.description !== undefined) updateData.description = updateAdminProfileDto.description;
    if (updateAdminProfileDto.managerName !== undefined) updateData.managerName = updateAdminProfileDto.managerName;
    if (updateAdminProfileDto.instagramUrl !== undefined) updateData.instagramUrl = updateAdminProfileDto.instagramUrl;
    if (updateAdminProfileDto.tiktokUrl !== undefined) updateData.tiktokUrl = updateAdminProfileDto.tiktokUrl;
    if (updateAdminProfileDto.facebookUrl !== undefined) updateData.facebookUrl = updateAdminProfileDto.facebookUrl;

    // Aplicar actualizaciones
    Object.assign(company, updateData);
    const updatedCompany = await this.companyRepository.save(company);

    const companyWithLogo: CompanyWithLogoUrl = {
      ...updatedCompany,
      logoUrl: updatedCompany.logo ? this.fileUploadService.getFileUrl('company_logo', updatedCompany.logo) : null
    };

    return companyWithLogo;
  }



    /**
  * Eliminación temporal de trabajador - para poder reconectarlo después
  * Solo marca el registro como temporalmente eliminado, manteniendo los datos
  */
  async temporarilyRemoveWorkerFromCompany(
    adminId: number,
    workerId: number
  ): Promise<{ message: string; canRestore: boolean }> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new NotFoundException('No tienes una compañía asignada');
    }

    // 2. Buscar la asignación específica del trabajador en la compañía
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: {
        workerId: workerId,
        companyId: company.id,
        permanentlyDeleted: false // No incluir los permanentemente eliminados
      }
    });

    if (!companyWorker) {
      throw new NotFoundException('Este trabajador no está asignado a tu compañía o ya fue eliminado');
    }

    // 3. Verificar si ya está temporalmente eliminado
    if (companyWorker.temporarilyDeleted) {
      throw new BadRequestException('Este trabajador ya está temporalmente eliminado');
    }

    // 4. Marcar como temporalmente eliminado
    companyWorker.temporarilyDeleted = true;
    companyWorker.isActive = 0; // Desactivar
    companyWorker.endDate = new Date(); // Establecer fecha de fin

    await this.companyWorkerRepository.save(companyWorker);

    return {
      message: 'Trabajador eliminado temporalmente de la compañía. Puedes restaurarlo cuando lo necesites.',
      canRestore: true
    };
  }

  /**
   * Restaurar trabajador temporalmente eliminado
   */
  // En CompanyService, corrige el método restoreTemporarilyRemovedWorker:

  async restoreTemporarilyRemovedWorker(
    adminId: number,
    workerId: number
  ): Promise<{ message: string }> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new NotFoundException('No tienes una compañía asignada');
    }

    const companyWorker = await this.companyWorkerRepository.findOne({
      where: {
        workerId: workerId,
        companyId: company.id,
        temporarilyDeleted: true,
        permanentlyDeleted: false
      }
    });

    if (!companyWorker) {
      throw new NotFoundException('No se encontró un trabajador temporalmente eliminado con estos datos');
    }

    // Restaurar el trabajador
    companyWorker.temporarilyDeleted = false;
    companyWorker.isActive = 1; // Reactivar
    companyWorker.endDate = null as any; 

    await this.companyWorkerRepository.save(companyWorker);

    return {
      message: 'Trabajador restaurado exitosamente en la compañía.'
    };
  }
  /**
   * Eliminación permanente de trabajador - no aparece más en ningún lado
   * Marca el registro como permanentemente eliminado
   */
  async permanentlyRemoveWorkerFromCompany(
    adminId: number,
    workerId: number
  ): Promise<{ message: string; canRestore: boolean }> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new NotFoundException('No tienes una compañía asignada');
    }

    // 2. Buscar la asignación específica del trabajador en la compañía
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: {
        workerId: workerId,
        companyId: company.id
      }
    });

    if (!companyWorker) {
      throw new NotFoundException('Este trabajador no está asignado a tu compañía');
    }

    // 3. Marcar como permanentemente eliminado
    companyWorker.permanentlyDeleted = true;
    companyWorker.temporarilyDeleted = false; // Asegurar que no esté marcado como temporal
    companyWorker.isActive = 0; // Desactivar
    companyWorker.endDate = new Date(); // Establecer fecha de fin

    await this.companyWorkerRepository.save(companyWorker);

    return {
      message: 'Trabajador eliminado permanentemente de la compañía. No podrá ser restaurado.',
      canRestore: false
    };
  }

  /**
   * Obtener lista de trabajadores temporalmente eliminados
   */
  async getTemporarilyRemovedWorkers(
    adminId: number
  ): Promise<CompanyWorker[]> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new NotFoundException('No tienes una compañía asignada');
    }

    return await this.companyWorkerRepository.find({
      where: {
        companyId: company.id,
        temporarilyDeleted: true,
        permanentlyDeleted: false
      },
      relations: ['worker']
    });
  }


  /**
   * Eliminación temporal de cliente - para poder reconectarlo después
   * Solo marca el registro como temporalmente eliminado, manteniendo los datos
   */
  async temporarilyRemoveClientFromCompany(
    adminId: number,
    clientId: number
  ): Promise<{ message: string; canRestore: boolean }> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new NotFoundException('No tienes una compañía asignada');
    }

    // 2. Buscar el cliente
    const client = await this.clientRepository.findOne({
      where: { 
        id: clientId,
        permanentlyDeleted: false // No incluir los permanentemente eliminados
      }
    });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado o ya fue eliminado permanentemente');
    }

    // 3. Verificar que el cliente está asociado a la compañía del admin
    // Los clientes se asocian a través del array 'companies'
    if (!client.companies || !client.companies.includes(company.id)) {
      throw new NotFoundException('Este cliente no está asociado a tu compañía');
    }

    // 4. Verificar si ya está temporalmente eliminado
    if (client.temporarilyDeleted) {
      throw new BadRequestException('Este cliente ya está temporalmente eliminado');
    }

    // 5. Marcar como temporalmente eliminado
    client.temporarilyDeleted = true;
    client.isActive = 0; // Desactivar
    
    await this.clientRepository.save(client);

    return {
      message: 'Cliente eliminado temporalmente. Puedes restaurarlo cuando lo necesites.',
      canRestore: true
    };
  }

  /**
   * Restaurar cliente temporalmente eliminado
   */
  async restoreTemporarilyRemovedClient(
    adminId: number,
    clientId: number
  ): Promise<{ message: string }> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new NotFoundException('No tienes una compañía asignada');
    }

    const client = await this.clientRepository.findOne({
      where: {
        id: clientId,
        temporarilyDeleted: true,
        permanentlyDeleted: false
      }
    });

    if (!client) {
      throw new NotFoundException('No se encontró un cliente temporalmente eliminado con estos datos');
    }

    // Verificar que el cliente está asociado a la compañía del admin
    if (!client.companies || !client.companies.includes(company.id)) {
      throw new NotFoundException('Este cliente no está asociado a tu compañía');
    }

    // Restaurar el cliente
    client.temporarilyDeleted = false;
    client.isActive = 1; // Reactivar
    
    await this.clientRepository.save(client);

    return {
      message: 'Cliente restaurado exitosamente.'
    };
  }

  /**
   * Eliminación permanente de cliente - no aparece más en ningún lado
   * Marca el registro como permanentemente eliminado
   */
  async permanentlyRemoveClientFromCompany(
    adminId: number,
    clientId: number
  ): Promise<{ message: string; canRestore: boolean }> {
    // 1. Verificar que el administrador tiene una compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new NotFoundException('No tienes una compañía asignada');
    }

    // 2. Buscar el cliente
    const client = await this.clientRepository.findOne({
      where: { id: clientId }
    });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    // 3. Verificar que el cliente está asociado a la compañía del admin
    if (!client.companies || !client.companies.includes(company.id)) {
      throw new NotFoundException('Este cliente no está asociado a tu compañía');
    }

    // 4. Marcar como permanentemente eliminado
    client.permanentlyDeleted = true;
    client.temporarilyDeleted = false; // Asegurar que no esté marcado como temporal
    client.isActive = 0; // Desactivar
    
    await this.clientRepository.save(client);

    return {
      message: 'Cliente eliminado permanentemente. No podrá ser restaurado.',
      canRestore: false
    };
  }

  /**
   * Obtener lista de clientes temporalmente eliminados del admin
   */
  async getTemporarilyRemovedClients(
    adminId: number
  ): Promise<Client[]> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new NotFoundException('No tienes una compañía asignada');
    }

    // Buscar clientes temporalmente eliminados que estén asociados a la compañía del admin
    const allTemporarilyDeletedClients = await this.clientRepository.find({
      where: {
        temporarilyDeleted: true,
        permanentlyDeleted: false
      }
    });

    // Filtrar solo los que están asociados a la compañía del admin
    return allTemporarilyDeletedClients.filter(client => 
      client.companies && client.companies.includes(company.id)
    );
  }
}