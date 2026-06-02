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
import { WorkerFeedbackStatsDto } from '../worker/dto/worker-feedback-stats.dto';

export type ServiceFeedbackPaginatedResult =
  PaginationResult<ServiceFeedback> & {
    stats: WorkerFeedbackStatsDto;
  };

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
      .leftJoinAndMapOne(
        'feedback.client',
        Client,
        'client',
        'client.userId = feedback.clientId',
      )
      .where('feedback.id = :id', { id })
      .getOne();

    if (!feedback) {
      throw new NotFoundException(`ServiceFeedback with id ${id} not found`);
    }

    if (feedback.client?.picture) {
      feedback.client.pictureUrl = this.fileUploadService.getFileUrl(
        'client_photo',
        feedback.client.picture,
      );
    }

    return feedback;
  }

  async create(
    createDto: CreateServiceFeedbackDto,
    serviceId: number,
    clientId?: number,
  ): Promise<ServiceFeedback> {
    const service = await this.serviceRepository.findOne({
      where: { id: serviceId },
    });
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
    const feedback = await this.serviceFeedbackRepository.findOne({
      where: { id },
    });
    if (!feedback) {
      throw new NotFoundException(`ServiceFeedback with id ${id} not found`);
    }

    if (
      requesterUserId &&
      feedback.clientId &&
      requesterUserId !== feedback.clientId &&
      requesterUserType !== 'adm'
    ) {
      throw new ForbiddenException(
        'No tienes permiso para actualizar este feedback',
      );
    }

    if (
      updateDto.stars !== undefined &&
      (updateDto.stars < 1 || updateDto.stars > 5)
    ) {
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
    const feedback = await this.serviceFeedbackRepository.findOne({
      where: { id },
    });
    if (!feedback) {
      throw new NotFoundException(`ServiceFeedback with id ${id} not found`);
    }

    if (
      requesterUserId &&
      feedback.clientId &&
      requesterUserId !== feedback.clientId &&
      requesterUserType !== 'adm'
    ) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar este feedback',
      );
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
    const service = await this.serviceRepository.findOne({
      where: { id: serviceId },
    });
    if (!service) {
      throw new NotFoundException(`Service with id ${serviceId} not found`);
    }

    const queryBuilder: SelectQueryBuilder<ServiceFeedback> =
      this.serviceFeedbackRepository
        .createQueryBuilder('feedback')
        .leftJoinAndSelect('feedback.service', 'service')
        .leftJoinAndMapOne(
          'feedback.client',
          Client,
          'client',
          'client.userId = feedback.clientId',
        )
        .where('feedback.serviceId = :serviceId', { serviceId })
        .orderBy('feedback.datetime', 'DESC');

    const result = await paginate<ServiceFeedback>(queryBuilder, {
      page,
      limit,
    });

    result.data = result.data.map((feedback) => {
      if (feedback.client?.picture) {
        feedback.client.pictureUrl = this.fileUploadService.getFileUrl(
          'client_photo',
          feedback.client.picture,
        );
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
    serviceId?: number,
  ): Promise<ServiceFeedbackPaginatedResult> {
    const company = await this.companyRepository.findOne({ where: { userId } });
    if (!company) {
      throw new NotFoundException(`No company found for user ${userId}`);
    }

    // Subconsulta: serviceIds que pertenecen a la compañía
    const serviceIdsSubQuery = this.serviceRepository
      .createQueryBuilder('s')
      .select('s.id')
      .where('s.companyId = :companyId', { companyId: company.id });

    // Si se pasó serviceId, validar que pertenece a la compañía
    if (serviceId !== undefined) {
      const belongs = await this.serviceRepository.findOne({
        where: { id: serviceId, companyId: company.id },
      });
      if (!belongs) {
        throw new ForbiddenException(
          `Service ${serviceId} no pertenece a esta compañía`,
        );
      }
    }

    const queryBuilder = this.serviceFeedbackRepository
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.service', 'service')
      .leftJoinAndMapOne(
        'feedback.client',
        Client,
        'client',
        'client.userId = feedback.clientId',
      )
      .where(`feedback.serviceId IN (${serviceIdsSubQuery.getQuery()})`)
      .setParameters(serviceIdsSubQuery.getParameters())
      .orderBy('feedback.datetime', 'DESC');

    if (serviceId !== undefined) {
      queryBuilder.andWhere('feedback.serviceId = :targetServiceId', {
        targetServiceId: serviceId,
      });
    }

    const result = await paginate<ServiceFeedback>(queryBuilder, {
      page,
      limit,
    });

    result.data = result.data.map((feedback) => {
      if (feedback.client?.picture) {
        feedback.client.pictureUrl = this.fileUploadService.getFileUrl(
          'client_photo',
          feedback.client.picture,
        );
      }
      return feedback;
    });

    const stats =
      serviceId !== undefined
        ? await this.computeStatsForServiceIds([serviceId])
        : await this.computeStatsForServiceIdsSubQuery(serviceIdsSubQuery);

    return { ...result, stats };
  }

  /**
   * Stats agregadas (promedio + conteo por estrella) para una lista de
   * serviceIds (ej. un servicio puntual).
   */
  private async computeStatsForServiceIds(
    serviceIds: number[],
  ): Promise<WorkerFeedbackStatsDto> {
    if (serviceIds.length === 0) return this.emptyStats();
    const qb = this.serviceFeedbackRepository
      .createQueryBuilder('feedback')
      .where('feedback.serviceId IN (:...serviceIds)', { serviceIds });
    return this.aggregateStats(qb);
  }

  /**
   * Stats agregadas reutilizando la subconsulta de serviceIds que pertenecen
   * a la compañía del admin.
   */
  private async computeStatsForServiceIdsSubQuery(
    serviceIdsSubQuery: SelectQueryBuilder<Service>,
  ): Promise<WorkerFeedbackStatsDto> {
    const qb = this.serviceFeedbackRepository
      .createQueryBuilder('feedback')
      .where(`feedback.serviceId IN (${serviceIdsSubQuery.getQuery()})`)
      .setParameters(serviceIdsSubQuery.getParameters());
    return this.aggregateStats(qb);
  }

  private async aggregateStats(
    baseQb: SelectQueryBuilder<ServiceFeedback>,
  ): Promise<WorkerFeedbackStatsDto> {
    const rows: Array<{ stars: number | null; count: string }> = await baseQb
      .clone()
      .select('feedback.stars', 'stars')
      .addSelect('COUNT(*)', 'count')
      .groupBy('feedback.stars')
      .getRawMany();

    const stats = this.emptyStats();
    let total = 0;
    let weighted = 0;
    for (const row of rows) {
      const stars = row.stars == null ? null : Number(row.stars);
      const count = Number(row.count);
      if (stars === null) continue;
      total += count;
      weighted += stars * count;
      switch (stars) {
        case 5:
          stats.fiveStarCount = count;
          break;
        case 4:
          stats.fourStarCount = count;
          break;
        case 3:
          stats.threeStarCount = count;
          break;
        case 2:
          stats.twoStarCount = count;
          break;
        case 1:
          stats.oneStarCount = count;
          break;
      }
    }
    stats.totalFeedbacks = total;
    stats.averageStars =
      total === 0 ? 0 : Number((weighted / total).toFixed(2));
    return stats;
  }

  private emptyStats(): WorkerFeedbackStatsDto {
    return {
      averageStars: 0,
      totalFeedbacks: 0,
      fiveStarCount: 0,
      fourStarCount: 0,
      threeStarCount: 0,
      twoStarCount: 0,
      oneStarCount: 0,
    };
  }
}
