import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
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

  async findAllByCompany(
    adminId: number,
    isActive?: boolean,
  ): Promise<ProductCategory[]> {
    const company = await this.getCompanyOrFail(adminId);
    return this.categoryRepository.find({
      where: {
        companyId: company.id,
        ...(isActive !== undefined ? { isActive } : {}),
      },
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
      isActive: dto.isActive ?? true,
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
    const company = await this.getCompanyOrFail(adminId);
    const category = await this.categoryRepository.findOne({
      where: { id, companyId: company.id },
      relations: ['products'],
    });
    if (!category)
      throw new NotFoundException(`Categoría con id ${id} no encontrada`);
    if (category.products?.length > 0) {
      throw new ConflictException(
        `No se puede eliminar la categoría "${category.name}" porque tiene ${category.products.length} producto(s) asignado(s). Reasígnalos o elimínalos primero.`,
      );
    }
    await this.categoryRepository.delete(category.id);
  }
}
