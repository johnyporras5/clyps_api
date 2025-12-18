import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyWorker } from './entities/company_worker.entity';
import { CreateCompanyWorkerDto } from './dto/create-company_worker.dto';
import { UpdateCompanyWorkerDto } from './dto/update-company_worker.dto';

@Injectable()
export class CompanyWorkerService {
  constructor(
    @InjectRepository(CompanyWorker)
    private CompanyWorkerRepository: Repository<CompanyWorker>,
  ) {}

  async findAll(): Promise<CompanyWorker[]> {
    return await this.CompanyWorkerRepository.find();
  }

  async findOne(id: number): Promise<CompanyWorker> {
    const CompanyWorker = await this.CompanyWorkerRepository.findOne({ where: { id } });
    if (!CompanyWorker) {
      throw new NotFoundException(`CompanyWorker with id ${id} not found`);
    }
    return CompanyWorker;
  }

  async create(createCompanyWorkerDto: CreateCompanyWorkerDto): Promise<CompanyWorker> {
    const CompanyWorker = this.CompanyWorkerRepository.create(createCompanyWorkerDto);
    return await this.CompanyWorkerRepository.save(CompanyWorker);
  }

  async update(id: number, updateCompanyWorkerDto: UpdateCompanyWorkerDto): Promise<CompanyWorker> {
    const CompanyWorker = await this.CompanyWorkerRepository.findOne({ where: { id } });
    if (!CompanyWorker) {
      throw new NotFoundException(`CompanyWorker with id ${id} not found`);
    }
    
    Object.assign(CompanyWorker, updateCompanyWorkerDto);
    return await this.CompanyWorkerRepository.save(CompanyWorker);
  }

  async remove(id: number): Promise<void> {
    const result = await this.CompanyWorkerRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`CompanyWorker with id ${id} not found`);
    }
  }
}
