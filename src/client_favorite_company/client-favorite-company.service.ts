import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ClientFavoriteCompany } from './entities/client-favorite-company.entity';
import { Client } from '../client/entities/client.entity';
import { Company } from '../company/entities/company.entity';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { FileUploadService } from '../common/services/file_upload.service';

@Injectable()
export class ClientFavoriteCompanyService {
  constructor(
    @InjectRepository(ClientFavoriteCompany)
    private readonly favoriteRepository: Repository<ClientFavoriteCompany>,

    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,

    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    private readonly fileUploadService: FileUploadService,
  ) {}

  private async getClientIdByUserId(userId: number): Promise<number> {
    const client = await this.clientRepository.findOne({ where: { userId } });
    if (!client) {
      throw new NotFoundException(`No client found for user id ${userId}`);
    }
    return client.id;
  }

  async addFavorite(
    userId: number,
    companyId: number,
  ): Promise<ClientFavoriteCompany> {
    const clientId = await this.getClientIdByUserId(userId);

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with id ${companyId} not found`);
    }

    const existing = await this.favoriteRepository.findOne({
      where: { clientId, companyId },
    });
    if (existing) {
      throw new ConflictException('La compañía ya está en favoritos');
    }

    const favorite = this.favoriteRepository.create({ clientId, companyId });
    return await this.favoriteRepository.save(favorite);
  }

  async removeFavorite(userId: number, companyId: number): Promise<void> {
    const clientId = await this.getClientIdByUserId(userId);

    const result = await this.favoriteRepository.delete({
      clientId,
      companyId,
    });
    if (result.affected === 0) {
      throw new NotFoundException('La compañía no está en favoritos');
    }
  }

  async listFavorites(
    userId: number,
    page = 1,
    limit = 10,
  ): Promise<PaginationResult<ClientFavoriteCompany>> {
    const clientId = await this.getClientIdByUserId(userId);

    const queryBuilder: SelectQueryBuilder<ClientFavoriteCompany> =
      this.favoriteRepository
        .createQueryBuilder('favorite')
        .leftJoinAndSelect('favorite.company', 'company')
        .where('favorite.clientId = :clientId', { clientId })
        .orderBy('favorite.createdAt', 'DESC');

    const result = await paginate<ClientFavoriteCompany>(queryBuilder, {
      page,
      limit,
    });

    const dataWithLogoUrl = result.data.map((favorite) => {
      const company = favorite.company;
      const logoUrl = company?.logo
        ? this.fileUploadService.getFileUrl('company_logo', company.logo)
        : null;
      return {
        ...favorite,
        company: company ? { ...company, logoUrl } : company,
      } as ClientFavoriteCompany;
    });

    return { ...result, data: dataWithLogoUrl };
  }

  async isFavorite(
    userId: number,
    companyId: number,
  ): Promise<{ isFavorite: boolean }> {
    const clientId = await this.getClientIdByUserId(userId);
    const count = await this.favoriteRepository.count({
      where: { clientId, companyId },
    });
    return { isFavorite: count > 0 };
  }
}
