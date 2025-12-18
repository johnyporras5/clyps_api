import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company)
    private CompanyRepository: Repository<Company>,
  ) {}

  async findAll(): Promise<Company[]> {
    return await this.CompanyRepository.find();
  }

  async findOne(id: number): Promise<Company> {
    const Company = await this.CompanyRepository.findOne({ where: { id } });
    if (!Company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
    return Company;
  }

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    const Company = this.CompanyRepository.create(createCompanyDto);
    return await this.CompanyRepository.save(Company);
  }

  async update(id: number, updateCompanyDto: UpdateCompanyDto): Promise<Company> {
    const Company = await this.CompanyRepository.findOne({ where: { id } });
    if (!Company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
    
    Object.assign(Company, updateCompanyDto);
    return await this.CompanyRepository.save(Company);
  }

  async remove(id: number): Promise<void> {
    const result = await this.CompanyRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
  }
}
