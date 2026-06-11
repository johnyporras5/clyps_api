import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceCategory } from './entities/service_category.entity';
import { Company } from '../company/entities/company.entity';
import { CreateServiceCategoryDto } from './dto/create-service-category.dto';
import { UpdateServiceCategoryDto } from './dto/update-service-category.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { companyRoom, companyPublicRoom } from '../realtime/rooms';

@Injectable()
export class ServiceCategoryService {
  constructor(
    @InjectRepository(ServiceCategory)
    private categoryRepository: Repository<ServiceCategory>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Emite category.changed a company:<id> + company-public:<id> (CLYP-244).
   * Cubre create/update/delete de categorías de servicio.
   */
  private emitCategoryChanged(category: ServiceCategory): void {
    this.realtime.emitEntity(
      [companyRoom(category.companyId), companyPublicRoom(category.companyId)],
      {
        type: 'category.changed',
        entityId: category.id,
        companyId: category.companyId,
        data: category,
      },
    );
  }

  private async getCompanyOrFail(adminId: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company)
      throw new UnauthorizedException('No tienes una compañía asignada');
    return company;
  }

  async findAllByCompany(adminId: number): Promise<ServiceCategory[]> {
    const company = await this.getCompanyOrFail(adminId);
    return this.categoryRepository.find({
      where: { companyId: company.id },
      relations: ['services'],
    });
  }

  async findOne(id: number, adminId: number): Promise<ServiceCategory> {
    const company = await this.getCompanyOrFail(adminId);
    const category = await this.categoryRepository.findOne({
      where: { id, companyId: company.id },
      relations: ['services'],
    });
    if (!category)
      throw new NotFoundException(`Category with id ${id} not found`);
    return category;
  }

  async create(
    dto: CreateServiceCategoryDto,
    adminId: number,
  ): Promise<ServiceCategory> {
    const company = await this.getCompanyOrFail(adminId);
    const category = this.categoryRepository.create({
      name: dto.name,
      description: dto.description,
      companyId: company.id,
      isActive: dto.isActive ?? true,
    });
    const saved = await this.categoryRepository.save(category);
    this.emitCategoryChanged(saved);
    return saved;
  }

  async update(
    id: number,
    dto: UpdateServiceCategoryDto,
    adminId: number,
  ): Promise<ServiceCategory> {
    const company = await this.getCompanyOrFail(adminId);
    const category = await this.categoryRepository.findOne({
      where: { id, companyId: company.id },
    });
    if (!category)
      throw new NotFoundException(`Category with id ${id} not found`);
    Object.assign(category, dto);
    const saved = await this.categoryRepository.save(category);
    this.emitCategoryChanged(saved);
    return saved;
  }

  async remove(id: number, adminId: number): Promise<void> {
    const company = await this.getCompanyOrFail(adminId);
    const category = await this.categoryRepository.findOne({
      where: { id, companyId: company.id },
      relations: ['services'],
    });
    if (!category)
      throw new NotFoundException(`Categoría con id ${id} no encontrada`);
    if (category.services?.length > 0) {
      throw new ConflictException(
        `No se puede eliminar la categoría "${category.name}" porque tiene ${category.services.length} servicio(s) asociado(s). Reasigna o elimina los servicios primero.`,
      );
    }
    await this.categoryRepository.delete(id);
    this.emitCategoryChanged(category);
  }
}
