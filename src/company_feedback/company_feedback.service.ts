import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyFeedback } from './entities/company_feedback.entity';
import { CreateCompanyFeedbackDto } from './dto/create-company_feedback.dto';
import { UpdateCompanyFeedbackDto } from './dto/update-company_feedback.dto';

@Injectable()
export class CompanyFeedbackService {
  constructor(
    @InjectRepository(CompanyFeedback)
    private CompanyFeedbackRepository: Repository<CompanyFeedback>,
  ) {}

  async findAll(): Promise<CompanyFeedback[]> {
    return await this.CompanyFeedbackRepository.find();
  }

  async findOne(id: number): Promise<CompanyFeedback> {
    const CompanyFeedback = await this.CompanyFeedbackRepository.findOne({ where: { id } });
    if (!CompanyFeedback) {
      throw new NotFoundException(`CompanyFeedback with id ${id} not found`);
    }
    return CompanyFeedback;
  }

  async create(createCompanyFeedbackDto: CreateCompanyFeedbackDto): Promise<CompanyFeedback> {
    const CompanyFeedback = this.CompanyFeedbackRepository.create(createCompanyFeedbackDto);
    return await this.CompanyFeedbackRepository.save(CompanyFeedback);
  }

  async update(id: number, updateCompanyFeedbackDto: UpdateCompanyFeedbackDto): Promise<CompanyFeedback> {
    const CompanyFeedback = await this.CompanyFeedbackRepository.findOne({ where: { id } });
    if (!CompanyFeedback) {
      throw new NotFoundException(`CompanyFeedback with id ${id} not found`);
    }
    
    Object.assign(CompanyFeedback, updateCompanyFeedbackDto);
    return await this.CompanyFeedbackRepository.save(CompanyFeedback);
  }

  async remove(id: number): Promise<void> {
    const result = await this.CompanyFeedbackRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`CompanyFeedback with id ${id} not found`);
    }
  }
}
