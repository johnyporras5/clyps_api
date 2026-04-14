import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, SelectQueryBuilder } from 'typeorm';
import { ServiceFeedback } from './entities/service_feedback.entity';
import { CreateServiceFeedbackDto } from './dto/create-service_feedback.dto';
import { UpdateServiceFeedbackDto } from './dto/update-service_feedback.dto';
import { Service } from '../service/entities/service.entity';
import { Company } from '../company/entities/company.entity';
import { Client } from '../client/entities/client.entity';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { FileUploadService } from '../common/services/file_upload.service';

@Injectable()
export class ServiceFeedbackService {
  constructor(
    @InjectRepository(ServiceFeedback)
    private serviceFeedbackRepository: Repository<ServiceFeedback>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    private fileUploadService: FileUploadService,
  ) {}

  async findOne(id: number): Promise<ServiceFeedback> {
    const feedback = await this.serviceFeedbackRepository
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.service', 'service')
      .leftJoinAndMapOne('feedback.client', Client, 'client', 'client.userId = feedback.clientId')
      .where('feedback.id = :id', { id })
      .getOne();

    if (!feedback) {
      throw new NotFoundException(`ServiceFeedback with id ${id} not found`);
    }

    if (feedback.client?.picture) {
      feedback.client.pictureUrl = this.fileUploadService.getFileUrl('client_photo', feedback.client.picture);
    }

    return feedback;
  }

  async create(
    createDto: CreateServiceFeedbackDto,
    serviceId: number,
    clientId?: number,
  ): Promise<ServiceFeedback> {
    const service = await this.serviceRepository.findOne({ where: { id: serviceId } });
    if (!service) {
      throw new NotFoundException(`Service with id ${serviceId} not found`);
    }

    if (createDto.stars < 1 || createDto.stars > 5) {
      throw new BadRequestException('stars must be between 1 and 5');
    }

    const data: DeepPartial<ServiceFeedback> = {
      stars: createDto.stars,
      description: createDto.description,
      serviceId,
      clientId: clientId ?? null,
    };

    const feedback = this.serviceFeedbackRepository.create(data);
    return await this.serviceFeedbackRepository.save(feedback);
  }

  async update(
    id: number,
    updateDto: UpdateServiceFeedbackDto,
    requesterUserId?: number,
    requesterUserType?: string,
  ): Promise<ServiceFeedback> {
    const feedback = await this.serviceFeedbackRepository.findOne({ where: { id } });
    if (!feedback) {
      throw new NotFoundException(`ServiceFeedback with id ${id} not found`);
    }

    if (
      requesterUserId &&
      feedback.clientId &&
      requesterUserId !== feedback.clientId &&
      requesterUserType !== 'adm'
    ) {
      throw new ForbiddenException('No tienes permiso para actualizar este feedback');
    }

    if (updateDto.stars !== undefined && (updateDto.stars < 1 || updateDto.stars > 5)) {
      throw new BadRequestException('stars must be between 1 and 5');
    }

    Object.assign(feedback, updateDto);
    return await this.serviceFeedbackRepository.save(feedback);
  }

  async remove(
    id: number,
    requesterUserId?: number,
    requesterUserType?: string,
  ): Promise<void> {
    const feedback = await this.serviceFeedbackRepository.findOne({ where: { id } });
    if (!feedback) {
      throw new NotFoundException(`ServiceFeedback with id ${id} not found`);
    }

    if (
      requesterUserId &&
      feedback.clientId &&
      requesterUserId !== feedback.clientId &&
      requesterUserType !== 'adm'
    ) {
      throw new ForbiddenException('No tienes permiso para eliminar este feedback');
    }

    const result = await this.serviceFeedbackRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`ServiceFeedback with id ${id} not found`);
    }
  }

  async findByService(
    serviceId: number,
    page = 1,
    limit = 10,
  ): Promise<PaginationResult<ServiceFeedback>> {
    const service = await this.serviceRepository.findOne({ where: { id: serviceId } });
    if (!service) {
      throw new NotFoundException(`Service with id ${serviceId} not found`);
    }

    const queryBuilder: SelectQueryBuilder<ServiceFeedback> = this.serviceFeedbackRepository
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.service', 'service')
      .leftJoinAndMapOne('feedback.client', Client, 'client', 'client.userId = feedback.clientId')
      .where('feedback.serviceId = :serviceId', { serviceId })
      .orderBy('feedback.datetime', 'DESC');

    const result = await paginate<ServiceFeedback>(queryBuilder, { page, limit });

    result.data = result.data.map((feedback) => {
      if (feedback.client?.picture) {
        feedback.client.pictureUrl = this.fileUploadService.getFileUrl('client_photo', feedback.client.picture);
      }
      return feedback;
    });

    return result;
  }

  /**
   * Lista todos los feedbacks de los servicios que pertenecen a la compañía del admin autenticado.
   * @param userId - ID del usuario admin (del token)
   */
  async findAllByAdminCompany(
    userId: number,
    page = 1,
    limit = 10,
  ): Promise<PaginationResult<ServiceFeedback>> {
    const company = await this.companyRepository.findOne({ where: { userId } });
    if (!company) {
      throw new NotFoundException(`No company found for user ${userId}`);
    }

    // Subconsulta: serviceIds que pertenecen a la compañía
    const serviceIdsSubQuery = this.serviceRepository
      .createQueryBuilder('s')
      .select('s.id')
      .where('s.companyId = :companyId', { companyId: company.id });

    const queryBuilder = this.serviceFeedbackRepository
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.service', 'service')
      .leftJoinAndMapOne('feedback.client', Client, 'client', 'client.userId = feedback.clientId')
      .where(`feedback.serviceId IN (${serviceIdsSubQuery.getQuery()})`)
      .setParameters(serviceIdsSubQuery.getParameters())
      .orderBy('feedback.datetime', 'DESC');

    const result = await paginate<ServiceFeedback>(queryBuilder, { page, limit });

    result.data = result.data.map((feedback) => {
      if (feedback.client?.picture) {
        feedback.client.pictureUrl = this.fileUploadService.getFileUrl('client_photo', feedback.client.picture);
      }
      return feedback;
    });

    return result;
  }
}
