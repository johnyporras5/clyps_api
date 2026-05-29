import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyCategory } from './entities/company_category.entity';
import { Company } from '../company/entities/company.entity';
import { CreateCompanyCategoryDto } from './dto/create-company-category.dto';
import { UpdateCompanyCategoryDto } from './dto/update-company-category.dto';

@Injectable()
export class CompanyCategoryService {
  constructor(
    @InjectRepository(CompanyCategory)
    private categoryRepository: Repository<CompanyCategory>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
  ) {}

  private async getCompanyOrFail(adminId: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }
    return company;
  }

  async findAllByCompany(adminId: number): Promise<CompanyCategory[]> {
    const company = await this.getCompanyOrFail(adminId);
    return this.categoryRepository.find({
      where: { companyId: company.id },
    });
  }

  async findOne(id: number, adminId: number): Promise<CompanyCategory> {
    const company = await this.getCompanyOrFail(adminId);
    const category = await this.categoryRepository.findOne({
      where: { id, companyId: company.id },
    });
    if (!category) {
      throw new NotFoundException(`Categoría con id ${id} no encontrada`);
    }
    return category;
  }

  async create(
    dto: CreateCompanyCategoryDto,
    adminId: number,
  ): Promise<CompanyCategory> {
    const company = await this.getCompanyOrFail(adminId);
    const category = this.categoryRepository.create({
      name: dto.name,
      companyId: company.id,
    });
    return this.categoryRepository.save(category);
  }

  async update(
    id: number,
    dto: UpdateCompanyCategoryDto,
    adminId: number,
  ): Promise<CompanyCategory> {
    const company = await this.getCompanyOrFail(adminId);
    const category = await this.categoryRepository.findOne({
      where: { id, companyId: company.id },
    });
    if (!category) {
      throw new NotFoundException(`Categoría con id ${id} no encontrada`);
    }
    Object.assign(category, dto);
    return this.categoryRepository.save(category);
  }

  async remove(id: number, adminId: number): Promise<void> {
    const company = await this.getCompanyOrFail(adminId);
    const category = await this.categoryRepository.findOne({
      where: { id, companyId: company.id },
    });
    if (!category) {
      throw new NotFoundException(`Categoría con id ${id} no encontrada`);
    }
    await this.categoryRepository.delete(id);
  }
}
