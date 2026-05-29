import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, SelectQueryBuilder } from 'typeorm';
import { CompanyFeedback } from './entities/company_feedback.entity';
import { CreateCompanyFeedbackDto } from './dto/create-company_feedback.dto';
import { UpdateCompanyFeedbackDto } from './dto/update-company_feedback.dto';
import { Company } from '../company/entities/company.entity';
import { Client } from '../client/entities/client.entity';
import { Session } from '../session/entities/session.entity';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { FileUploadService } from '../common/services/file_upload.service';

@Injectable()
export class CompanyFeedbackService {
  constructor(
    @InjectRepository(CompanyFeedback)
    private companyFeedbackRepository: Repository<CompanyFeedback>,

    @InjectRepository(Company)
    private companyRepository: Repository<Company>,

    @InjectRepository(Client)
    private clientRepository: Repository<Client>,

    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,

    private fileUploadService: FileUploadService,
  ) { }


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
    const saved = await this.companyFeedbackRepository.save(feedback);

    // Si el cliente envió la calificación vinculada a una sesión, marcar la
    // sesión como RATED (sessionStatus = 6) para que el flujo de
    // "Calificar Servicio" no la siga proponiendo.
    if (createDto.sessionId && clientId) {
      await this.markSessionAsRatedIfOwned(createDto.sessionId, clientId);
    }

    return saved;
  }

  /**
   * Marca la sesión como RATED (sessionStatus = 6) sólo si:
   *  - existe,
   *  - pertenece al cliente autenticado (userId del token → clientId),
   *  - está actualmente en PAID (sessionStatus = 4).
   * No lanza error si no se cumplen las condiciones: la calificación ya se
   * guardó y el frontend no debe romper por un cambio de estado opcional.
   */
  private async markSessionAsRatedIfOwned(sessionId: number, clientUserId: number): Promise<void> {
    try {
      const client = await this.clientRepository.findOne({ where: { userId: clientUserId } });
      if (!client) return;

      const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
      if (!session) return;
      if (session.clientId !== client.id) return;
      if (session.sessionStatus !== 4) return;

      await this.sessionRepository.update({ id: sessionId, clientId: session.clientId }, { sessionStatus: 6 });
    } catch {
      // best-effort: no romper la creación del feedback por un fallo aquí
    }
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

  async findByCompany(
    userId: number,
    page = 1,
    limit = 10,
  ): Promise<PaginationResult<CompanyFeedback>> {
    // 1. Buscar la compañía cuyo userId coincida con el usuario autenticado
    const company = await this.companyRepository.findOne({
      where: { userId },
    });

    if (!company) {
      throw new NotFoundException(`No company found for user id ${userId}`);
    }

    // 2. Construir query builder para los feedbacks de esa compañía
    const queryBuilder: SelectQueryBuilder<CompanyFeedback> = this.companyFeedbackRepository
      .createQueryBuilder('feedback')
      .leftJoinAndMapOne('feedback.client', Client, 'client', 'client.userId = feedback.clientId')
      .where('feedback.companyId = :companyId', { companyId: company.id })
      .orderBy('feedback.datetime', 'DESC');

    // 3. Paginar
    const result = await paginate<CompanyFeedback>(queryBuilder, { page, limit });

    // 4. Agregar pictureUrl al cliente
    result.data = result.data.map((feedback) => {
      if (feedback.client?.picture) {
        feedback.client.pictureUrl = this.fileUploadService.getFileUrl('client_photo', feedback.client.picture);
      }
      return feedback;
    });

    return result;
  }



}
