import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { CompanyFeedback } from './entities/company_feedback.entity';
import { CreateCompanyFeedbackDto } from './dto/create-company_feedback.dto';
import { UpdateCompanyFeedbackDto } from './dto/update-company_feedback.dto';
import { Company } from '../company/entities/company.entity';

@Injectable()
export class CompanyFeedbackService {
  constructor(
    @InjectRepository(CompanyFeedback)
    private companyFeedbackRepository: Repository<CompanyFeedback>,

    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
  ) {}

  async findAll(): Promise<CompanyFeedback[]> {
    return await this.companyFeedbackRepository.find({ order: { datetime: 'DESC' } });
  }

  async findOne(id: number): Promise<CompanyFeedback> {
    const f = await this.companyFeedbackRepository.findOne({ where: { id } });
    if (!f) throw new NotFoundException(`CompanyFeedback with id ${id} not found`);
    return f;
  }

  async create(createDto: CreateCompanyFeedbackDto, companyId: number, clientId?: number): Promise<CompanyFeedback> {
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException(`Company with id ${companyId} not found`);

    if (createDto.stars < 1 || createDto.stars > 5) throw new BadRequestException('stars must be between 1 and 5');

    const data: DeepPartial<CompanyFeedback> = {
      stars: createDto.stars,
      description: createDto.description,
      companyId,
      clientId: clientId ?? null,
    };

    const feedback = this.companyFeedbackRepository.create(data);
    return await this.companyFeedbackRepository.save(feedback);
  }

  async update(id: number, updateDto: UpdateCompanyFeedbackDto, requesterUserId?: number, requesterUserType?: string): Promise<CompanyFeedback> {
    const feedback = await this.companyFeedbackRepository.findOne({ where: { id } });
    if (!feedback) throw new NotFoundException(`CompanyFeedback with id ${id} not found`);

    if (requesterUserId && feedback.clientId && requesterUserId !== feedback.clientId && requesterUserType !== 'adm') {
      throw new ForbiddenException('No tienes permiso para actualizar este feedback');
    }

    if (updateDto.stars !== undefined && (updateDto.stars < 1 || updateDto.stars > 5)) {
      throw new BadRequestException('stars must be between 1 and 5');
    }

    Object.assign(feedback, updateDto);
    return await this.companyFeedbackRepository.save(feedback);
  }

  async remove(id: number, requesterUserId?: number, requesterUserType?: string): Promise<void> {
    const feedback = await this.companyFeedbackRepository.findOne({ where: { id } });
    if (!feedback) throw new NotFoundException(`CompanyFeedback with id ${id} not found`);

    if (requesterUserId && feedback.clientId && requesterUserId !== feedback.clientId && requesterUserType !== 'adm') {
      throw new ForbiddenException('No tienes permiso para eliminar este feedback');
    }

    const result = await this.companyFeedbackRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException(`CompanyFeedback with id ${id} not found`);
  }

  async findByCompany(companyId: number, page = 1, limit = 10): Promise<{ data: CompanyFeedback[]; meta: any }> {
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException(`Company with id ${companyId} not found`);

    const skip = (page - 1) * limit;
    const [data, total] = await this.companyFeedbackRepository.findAndCount({
      where: { companyId },
      order: { datetime: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);
    return { data, meta: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 } };
  }

  /**
   * Listar todas las reseñas que el cliente autenticado escribió hacia companies
   */
  async findByClient(clientId: number, page = 1, limit = 10): Promise<{ data: CompanyFeedback[]; meta: any }> {
    const skip = (page - 1) * limit;
    const [data, total] = await this.companyFeedbackRepository.findAndCount({
      where: { clientId },
      order: { datetime: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);
    return { data, meta: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 } };
  }
}
