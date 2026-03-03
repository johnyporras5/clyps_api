import { Injectable, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Offer } from './entities/offer.entity';
import { ServiceOffer } from './entities/service-offer.entity';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { Company } from '../company/entities/company.entity';
import { Service } from '../service/entities/service.entity';

@Injectable()
export class OfferService {
  constructor(
    @InjectRepository(Offer)
    private offerRepository: Repository<Offer>,
    @InjectRepository(ServiceOffer)
    private serviceOfferRepository: Repository<ServiceOffer>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
  ) {}

  async findAllByCompany(adminId: number): Promise<Offer[]> {
    const company = await this.getCompanyByAdmin(adminId);
    return this.offerRepository.find({
      where: { companyId: company.id },
      relations: ['serviceOffers', 'serviceOffers.service'],
    });
  }

  async findOne(id: number, adminId: number): Promise<Offer> {
    const company = await this.getCompanyByAdmin(adminId);
    const offer = await this.offerRepository.findOne({
      where: { id, companyId: company.id },
      relations: ['serviceOffers', 'serviceOffers.service'],
    });
    if (!offer) {
      throw new NotFoundException(`Offer with id ${id} not found or you don't have permission`);
    }
    return offer;
  }

  async create(createOfferDto: CreateOfferDto, adminId: number): Promise<Offer> {
    const company = await this.getCompanyByAdmin(adminId);

    if (new Date(createOfferDto.startDate) >= new Date(createOfferDto.endDate)) {
      throw new BadRequestException('Start date must be before end date');
    }

    if (createOfferDto.serviceOffers?.length) {
      await this.validateServicesBelongToCompany(
        createOfferDto.serviceOffers.map(s => s.serviceId),
        company.id,
      );
    }

    // Crear oferta con serviceOffers (objetos planos)
    const offer = this.offerRepository.create({
      ...createOfferDto,
      companyId: company.id,
      serviceOffers: createOfferDto.serviceOffers?.map(item => ({
        serviceId: item.serviceId,
        price: item.price,
      })),
    });

    const savedOffer = await this.offerRepository.save(offer);
    return this.findOne(savedOffer.id, adminId);
  }

  async update(id: number, updateOfferDto: UpdateOfferDto, adminId: number): Promise<Offer> {
    const company = await this.getCompanyByAdmin(adminId);

    // Cargar la oferta con las relaciones existentes (IMPORTANTE)
    const offer = await this.offerRepository.findOne({
      where: { id, companyId: company.id },
      relations: ['serviceOffers'],
    });

    if (!offer) {
      throw new NotFoundException(`Offer with id ${id} not found or you don't have permission`);
    }

    if (updateOfferDto.startDate && updateOfferDto.endDate) {
      if (new Date(updateOfferDto.startDate) >= new Date(updateOfferDto.endDate)) {
        throw new BadRequestException('Start date must be before end date');
      }
    }

    const { serviceOffers, ...restDto } = updateOfferDto;
    Object.assign(offer, restDto);

    if (serviceOffers) {
      await this.validateServicesBelongToCompany(
        serviceOffers.map(s => s.serviceId),
        company.id,
      );

      // Reemplazar la colección con objetos planos (sin ids)
      // Usamos 'as any' para evitar error de TypeScript, TypeORM lo maneja correctamente
      offer.serviceOffers = serviceOffers.map(item => ({
        serviceId: item.serviceId,
        price: item.price,
        offer: offer, // Opcional, establece la relación inversa
      })) as any;
    }

    await this.offerRepository.save(offer);
    return this.findOne(id, adminId);
  }

  async remove(id: number, adminId: number): Promise<void> {
    const company = await this.getCompanyByAdmin(adminId);
    const offer = await this.offerRepository.findOne({
      where: { id, companyId: company.id },
    });
    if (!offer) {
      throw new NotFoundException(`Offer with id ${id} not found or you don't have permission`);
    }
    await this.offerRepository.remove(offer);
  }

  async setStatus(id: number, status: number, adminId: number): Promise<Offer> {
    const company = await this.getCompanyByAdmin(adminId);
    const offer = await this.offerRepository.findOne({
      where: { id, companyId: company.id },
    });
    if (!offer) {
      throw new NotFoundException(`Offer with id ${id} not found or you don't have permission`);
    }
    offer.status = status;
    await this.offerRepository.save(offer);
    return this.findOne(id, adminId);
  }

  private async getCompanyByAdmin(adminId: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }
    return company;
  }

  private async validateServicesBelongToCompany(serviceIds: number[], companyId: number): Promise<void> {
    const services = await this.serviceRepository.find({
      where: { id: In(serviceIds), companyId },
      select: ['id'],
    });
    const validIds = services.map(s => s.id);
    const invalidIds = serviceIds.filter(id => !validIds.includes(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Los siguientes servicios no pertenecen a tu compañía: ${invalidIds.join(', ')}`,
      );
    }
  }
}