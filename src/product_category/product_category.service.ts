import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductCategory } from './entities/product_category.entity';
import { Company } from '../company/entities/company.entity';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';

@Injectable()
export class ProductCategoryService {
  constructor(
    @InjectRepository(ProductCategory)
    private readonly categoryRepository: Repository<ProductCategory>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  private async getCompanyOrFail(adminId: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company)
      throw new UnauthorizedException('No tienes una compañía asignada');
    return company;
  }

  async findAllByCompany(adminId: number): Promise<ProductCategory[]> {
    const company = await this.getCompanyOrFail(adminId);
    return this.categoryRepository.find({
      where: { companyId: company.id },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number, adminId: number): Promise<ProductCategory> {
    const company = await this.getCompanyOrFail(adminId);
    const category = await this.categoryRepository.findOne({
      where: { id, companyId: company.id },
    });
    if (!category)
      throw new NotFoundException(`Categoría con id ${id} no encontrada`);
    return category;
  }

  async create(
    dto: CreateProductCategoryDto,
    adminId: number,
  ): Promise<ProductCategory> {
    const company = await this.getCompanyOrFail(adminId);
    const category = this.categoryRepository.create({
      name: dto.name,
      companyId: company.id,
      defaultCommissionBps: dto.defaultCommissionBps ?? null,
    });
    return this.categoryRepository.save(category);
  }

  async update(
    id: number,
    dto: UpdateProductCategoryDto,
    adminId: number,
  ): Promise<ProductCategory> {
    const category = await this.findOne(id, adminId);
    Object.assign(category, dto);
    return this.categoryRepository.save(category);
  }

  async remove(id: number, adminId: number): Promise<void> {
    const category = await this.findOne(id, adminId);
    // CLYP-320: cuando exista la entidad Product, bloquear el borrado si la
    // categoría tiene productos asignados (o exigir reasignarlos primero).
    await this.categoryRepository.delete(category.id);
  }
}
