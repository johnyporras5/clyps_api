import { Injectable, NotFoundException, Inject, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { CalendarCompany } from 'src/calendar_company/entities/calendar-company.entity';
import { GetCompaniesFilterDto } from './dto/get-companies-filter.dto';
import { Service } from 'src/service/entities/service.entity';
import { ServiceCategory } from 'src/service_category/entities/service_category.entity';
import { CompanyCategory } from 'src/company_category/entities/company_category.entity';
import { CompanyFeedback } from 'src/company_feedback/entities/company_feedback.entity';
import { WorkerFeedback } from 'src/worker_feedback/entities/worker_feedback.entity';
import { ServiceFeedback } from 'src/service_feedback/entities/service_feedback.entity';


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
    @InjectRepository(CalendarCompany)
    private calendarCompanyRepository: Repository<CalendarCompany>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(ServiceCategory)
    private serviceCategoryRepository: Repository<ServiceCategory>,
    @InjectRepository(CompanyCategory)
    private companyCategoryRepository: Repository<CompanyCategory>,
    @InjectRepository(CompanyFeedback)
    private companyFeedbackRepository: Repository<CompanyFeedback>,
    @InjectRepository(WorkerFeedback)
    private workerFeedbackRepository: Repository<WorkerFeedback>,
    @InjectRepository(ServiceFeedback)
    private serviceFeedbackRepository: Repository<ServiceFeedback>,
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
    where: { userId },
    relations: ['categories'],
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

  // ✅ OBTENER EL CALENDARIO (ya parseado como objeto)
  let calendarDetail = null;
  try {
    const calendar = await this.calendarCompanyRepository.findOne({
      where: { companyId: company.id }
    });
    if (calendar) {
      calendarDetail = calendar.calendarDetail; // TypeORM automáticamente parsea JSON
    }
  } catch (error) {
    console.error('❌ Error al obtener el calendario:', error);
  }

  // Excluir el password del usuario por seguridad
  const { password, ...userWithoutPassword } = user;

  const companyWithLogo: CompanyWithLogoUrl = {
    ...company,
    logoUrl: company.logo ? this.fileUploadService.getFileUrl('company_logo', company.logo) : null,
    calendarDetail: calendarDetail, // ✅ Objeto JSON, no string
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
      logoUrl: updatedCompany.logo ? this.fileUploadService.getFileUrl('company_logo', updatedCompany.logo) : null,

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
      await this.fileUploadService.deleteFile('company_logo', company.logo);
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
/**
 * Método único para actualizar el perfil del administrador
 * Maneja tanto los datos como el logo y el calendario en una sola operación
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
  if (updateAdminProfileDto.birthDate !== undefined) updateData.birthDate = new Date(updateAdminProfileDto.birthDate);

  // Aplicar actualizaciones
  Object.assign(company, updateData);
  const updatedCompany = await this.companyRepository.save(company);

  //  MANEJAR ACTUALIZACIÓN DEL CALENDARIO
  let calendarDetail = null;
  
  if (updateAdminProfileDto.calendarDetail !== undefined) {
    try {
      //  PARSEAR el JSON si viene como string desde form-data
      let parsedCalendarDetail = updateAdminProfileDto.calendarDetail;
      if (typeof updateAdminProfileDto.calendarDetail === 'string') {
        parsedCalendarDetail = JSON.parse(updateAdminProfileDto.calendarDetail);
      }

      // Buscar si ya existe un calendario para esta compañía
      let calendarCompany = await this.calendarCompanyRepository.findOne({
        where: { companyId: company.id }
      });

      if (calendarCompany) {
        // Si existe, actualizar solo el calendarDetail
        calendarCompany.calendarDetail = parsedCalendarDetail;
        await this.calendarCompanyRepository.save(calendarCompany);
        calendarDetail = calendarCompany.calendarDetail;
        console.log(`✅ Calendario actualizado para la compañía ${company.id}`);
      } else {
        // Si no existe, crear uno nuevo
        const newCalendar = this.calendarCompanyRepository.create({
          companyId: company.id,
          calendarDetail: parsedCalendarDetail,
        });
        const savedCalendar = await this.calendarCompanyRepository.save(newCalendar);
        calendarDetail = savedCalendar.calendarDetail;
        console.log(`✅ Calendario creado para la compañía ${company.id}`);
      }
    } catch (error) {
      console.error('❌ Error al actualizar el calendario:', error);
      // No lanzamos excepción para no bloquear la actualización del perfil
    }
  } else {
    // Si no se envió calendarDetail en el DTO, buscar el existente
    try {
      const existingCalendar = await this.calendarCompanyRepository.findOne({
        where: { companyId: company.id }
      });
      if (existingCalendar) {
        calendarDetail = existingCalendar.calendarDetail;
      }
    } catch (error) {
      console.error('❌ Error al obtener el calendario existente:', error);
    }
  }

  // ✅ INCLUIR calendarDetail EN LA RESPUESTA (ya parseado como objeto)
  const companyWithLogo: CompanyWithLogoUrl = {
    ...updatedCompany,
    logoUrl: updatedCompany.logo ? this.fileUploadService.getFileUrl('company_logo', updatedCompany.logo) : null,
    calendarDetail: calendarDetail, // ✅ Ya es un objeto, no un string
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

  async findByFilters(dto: GetCompaniesFilterDto): Promise<PaginationResult<CompanyWithLogoUrl>> {
    const query = this.companyRepository.createQueryBuilder('company');

    if (dto.categoryName) {
      query.innerJoin(
        'company.categories',
        'cat',
        'cat.name LIKE :catName',
        { catName: `%${dto.categoryName}%` },
      );
    }

    if (dto.city) {
      query.andWhere('company.location LIKE :city', { city: `%${dto.city}%` });
    }

    if (!dto.date) {
      const result = await paginate(query, { page: dto.page, limit: dto.limit });
      return {
        ...result,
        data: result.data.map(c => this.mapToCompanyWithLogoUrl(c)),
      };
    }

    const dayOfWeek = this.getDayOfWeek(dto.date);
    const allCompanies = await query.getMany();

    if (allCompanies.length === 0) {
      return {
        data: [],
        meta: { page: dto.page, limit: dto.limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      };
    }

    const companyIds = allCompanies.map(c => c.id);

    const [companyCalendars, workerCalendars] = await Promise.all([
      this.calendarCompanyRepository.find({ where: { companyId: In(companyIds) } }),
      this.companyWorkerRepository.find({
        where: {
          companyId: In(companyIds),
          isActive: 1,
          temporarilyDeleted: false,
          permanentlyDeleted: false,
        },
      }),
    ]);

    const compCalMap = new Map<number, any[]>();
    for (const cc of companyCalendars) {
      if (!compCalMap.has(cc.companyId)) compCalMap.set(cc.companyId, []);
      if (cc.calendarDetail) compCalMap.get(cc.companyId)!.push(cc.calendarDetail);
    }

    const workerCalMap = new Map<number, any[]>();
    for (const cw of workerCalendars) {
      if (!workerCalMap.has(cw.companyId)) workerCalMap.set(cw.companyId, []);
      if (cw.calendar) workerCalMap.get(cw.companyId)!.push(cw.calendar);
    }

    const available = allCompanies.filter(company => {
      const compCals = compCalMap.get(company.id) || [];
      const workerCals = workerCalMap.get(company.id) || [];
      return (
        compCals.some(cal => this.isCalendarAvailable(cal, dto.date!, dayOfWeek)) ||
        workerCals.some(cal => this.isCalendarAvailable(cal, dto.date!, dayOfWeek))
      );
    });

    const total = available.length;
    const skip = (dto.page - 1) * dto.limit;
    const totalPages = Math.ceil(total / dto.limit);

    return {
      data: available.slice(skip, skip + dto.limit).map(c => this.mapToCompanyWithLogoUrl(c)),
      meta: {
        page: dto.page,
        limit: dto.limit,
        total,
        totalPages,
        hasNext: dto.page < totalPages,
        hasPrev: dto.page > 1,
      },
    };
  }

  private getDayOfWeek(date: string): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const [year, month, day] = date.split('-').map(Number);
    return days[new Date(year, month - 1, day).getDay()];
  }

  private isCalendarAvailable(calendarDetail: any, date: string, dayOfWeek: string): boolean {
    let cal = calendarDetail;
    if (typeof cal === 'string') {
      try { cal = JSON.parse(cal); } catch { return false; }
    }
    if (!cal?.schedule?.days) return false;
    if (!cal.schedule.days.includes(dayOfWeek)) return false;
    const exception = cal.exceptions?.find((e: any) => e.date === date);
    if (exception?.type === 'non-working-day') return false;
    return true;
  }

  private mapToCompanyWithLogoUrl(company: Company): CompanyWithLogoUrl {
    return {
      ...company,
      logoUrl: company.logo ? this.fileUploadService.getFileUrl('company_logo', company.logo) : null,
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

  /**
   * Listado de compañías con logo, información, horario, ubicación,
   * equipo de trabajadores y servicios (con descripción, monto y duración).
   */
  async findAllWithDetails(
    options: PaginationOptions
  ): Promise<PaginationResult<any>> {
    const { page, limit } = options;
    const skip = (page - 1) * limit;

    const [companies, total] = await this.companyRepository.findAndCount({
      take: limit,
      skip,
      order: { id: 'ASC' },
    });

    if (companies.length === 0) {
      return {
        data: [],
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

    const companyIds = companies.map(c => c.id);

    const [
      calendars,
      companyWorkers,
      services,
      serviceCategories,
      companyCategories,
      companyRatings,
    ] = await Promise.all([
      this.calendarCompanyRepository.find({
        where: { companyId: In(companyIds) },
      }),
      this.companyWorkerRepository.find({
        where: {
          companyId: In(companyIds),
          isActive: 1,
          temporarilyDeleted: false,
          permanentlyDeleted: false,
        },
      }),
      this.serviceRepository.find({
        where: { companyId: In(companyIds) },
      }),
      this.serviceCategoryRepository.find({
        where: { companyId: In(companyIds), isActive: true },
      }),
      this.companyCategoryRepository.find({
        where: { companyId: In(companyIds) },
      }),
      this.companyFeedbackRepository
        .createQueryBuilder('f')
        .select('f.company_id', 'companyId')
        .addSelect('AVG(f.stars)', 'avg')
        .addSelect('COUNT(f.id)', 'count')
        .where('f.company_id IN (:...ids)', { ids: companyIds })
        .andWhere('f.stars IS NOT NULL')
        .groupBy('f.company_id')
        .getRawMany<{ companyId: number; avg: string; count: string }>(),
    ]);

    const workerIds = companyWorkers
      .map(cw => cw.worker?.id)
      .filter((id): id is number => typeof id === 'number');
    const serviceIds = services.map(s => s.id);

    const [workerRatings, serviceRatings] = await Promise.all([
      workerIds.length
        ? this.workerFeedbackRepository
            .createQueryBuilder('f')
            .select('f.worker_id', 'workerId')
            .addSelect('AVG(f.stars)', 'avg')
            .addSelect('COUNT(f.id)', 'count')
            .where('f.worker_id IN (:...ids)', { ids: workerIds })
            .andWhere('f.stars IS NOT NULL')
            .groupBy('f.worker_id')
            .getRawMany<{ workerId: number; avg: string; count: string }>()
        : Promise.resolve([]),
      serviceIds.length
        ? this.serviceFeedbackRepository
            .createQueryBuilder('f')
            .select('f.service_id', 'serviceId')
            .addSelect('AVG(f.stars)', 'avg')
            .addSelect('COUNT(f.id)', 'count')
            .where('f.service_id IN (:...ids)', { ids: serviceIds })
            .andWhere('f.stars IS NOT NULL')
            .groupBy('f.service_id')
            .getRawMany<{ serviceId: number; avg: string; count: string }>()
        : Promise.resolve([]),
    ]);

    const companyRatingMap = new Map<number, { average: number; total: number }>();
    for (const r of companyRatings) {
      companyRatingMap.set(Number(r.companyId), {
        average: Number(Number(r.avg).toFixed(2)),
        total: Number(r.count),
      });
    }
    const workerRatingMap = new Map<number, { average: number; total: number }>();
    for (const r of workerRatings) {
      workerRatingMap.set(Number(r.workerId), {
        average: Number(Number(r.avg).toFixed(2)),
        total: Number(r.count),
      });
    }
    const serviceRatingMap = new Map<number, { average: number; total: number }>();
    for (const r of serviceRatings) {
      serviceRatingMap.set(Number(r.serviceId), {
        average: Number(Number(r.avg).toFixed(2)),
        total: Number(r.count),
      });
    }

    const calendarByCompany = new Map<number, any>();
    for (const cal of calendars) {
      let detail = cal.calendarDetail;
      if (typeof detail === 'string') {
        try { detail = JSON.parse(detail); } catch { /* ignore */ }
      }
      calendarByCompany.set(cal.companyId, detail);
    }

    const workersByCompany = new Map<number, any[]>();
    for (const cw of companyWorkers) {
      if (!workersByCompany.has(cw.companyId)) {
        workersByCompany.set(cw.companyId, []);
      }
      const w = cw.worker;
      if (!w) continue;
      const rating = workerRatingMap.get(w.id) || { average: 0, total: 0 };
      workersByCompany.get(cw.companyId)!.push({
        id: w.id,
        name: w.name,
        lastName: w.lastName,
        phone: w.phone,
        description: w.description,
        location: w.location,
        instagramUrl: w.instagramUrl,
        tiktokUrl: w.tiktokUrl,
        facebookUrl: w.facebookUrl,
        pictureUrl: w.picture
          ? this.fileUploadService.getFileUrl('worker_photo', w.picture)
          : null,
        rating,
      });
    }

    const categoryById = new Map<number, ServiceCategory>();
    for (const cat of serviceCategories) {
      categoryById.set(cat.id, cat);
    }

    const servicesByCompany = new Map<number, any[]>();
    for (const s of services) {
      if (!servicesByCompany.has(s.companyId)) {
        servicesByCompany.set(s.companyId, []);
      }
      const cat = s.categoryId ? categoryById.get(s.categoryId) : null;
      const rating = serviceRatingMap.get(s.id) || { average: 0, total: 0 };
      servicesByCompany.get(s.companyId)!.push({
        id: s.id,
        name: s.name,
        description: s.description,
        cost: s.cost,
        currency: s.currency,
        standardTime: s.standardTime,
        status: s.status,
        category: cat
          ? { id: cat.id, name: cat.name, description: cat.description }
          : null,
        rating,
      });
    }

    const companyCategoriesByCompany = new Map<number, any[]>();
    for (const cc of companyCategories) {
      if (!companyCategoriesByCompany.has(cc.companyId)) {
        companyCategoriesByCompany.set(cc.companyId, []);
      }
      companyCategoriesByCompany.get(cc.companyId)!.push({
        id: cc.id,
        name: cc.name,
      });
    }

    const data = companies.map(company => ({
      id: company.id,
      name: company.name,
      description: company.description,
      location: company.location,
      email: company.email,
      phone: company.phone,
      managerName: company.managerName,
      instagramUrl: company.instagramUrl,
      tiktokUrl: company.tiktokUrl,
      facebookUrl: company.facebookUrl,
      logoUrl: company.logo
        ? this.fileUploadService.getFileUrl('company_logo', company.logo)
        : null,
      rating: companyRatingMap.get(company.id) || { average: 0, total: 0 },
      schedule: calendarByCompany.get(company.id) || null,
      categories: companyCategoriesByCompany.get(company.id) || [],
      workers: workersByCompany.get(company.id) || [],
      services: servicesByCompany.get(company.id) || [],
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      data,
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