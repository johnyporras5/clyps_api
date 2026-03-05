import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
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
      throw new NotFoundException(
        `Offer with id ${id} not found or you don't have permission`,
      );
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
        createOfferDto.serviceOffers.map((s) => s.serviceId),
        company.id,
      );
    }

    const offer = this.offerRepository.create({
      ...createOfferDto,
      companyId: company.id,
      serviceOffers: createOfferDto.serviceOffers?.map((item) => ({
        serviceId: item.serviceId,
        price: item.price,
      })),
    });

    const savedOffer = await this.offerRepository.save(offer);
    return this.findOne(savedOffer.id, adminId);
  }

  async update(
    id: number,
    updateOfferDto: UpdateOfferDto,
    adminId: number,
  ): Promise<Offer> {
    const company = await this.getCompanyByAdmin(adminId);

    const offer = await this.offerRepository.findOne({
      where: { id, companyId: company.id },
      relations: ['serviceOffers'],
    });

    if (!offer) {
      throw new NotFoundException(
        `Offer with id ${id} not found or you don't have permission`,
      );
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
        serviceOffers.map((s) => s.serviceId),
        company.id,
      );
      offer.serviceOffers = serviceOffers.map((item) => ({
        serviceId: item.serviceId,
        price: item.price,
        offer: offer,
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
      throw new NotFoundException(
        `Offer with id ${id} not found or you don't have permission`,
      );
    }
    await this.offerRepository.remove(offer);
  }

  async setStatus(id: number, status: number, adminId: number): Promise<Offer> {
    const company = await this.getCompanyByAdmin(adminId);
    const offer = await this.offerRepository.findOne({
      where: { id, companyId: company.id },
    });
    if (!offer) {
      throw new NotFoundException(
        `Offer with id ${id} not found or you don't have permission`,
      );
    }
    offer.status = status;
    await this.offerRepository.save(offer);
    return this.findOne(id, adminId);
  }

  /**
   * Obtener todos los servicios en ofertas activas y vigentes de la compañía.
   * Usado por el frontend para mostrar la lista de servicios en oferta
   * al momento de crear una sesión.
   */
  async findActiveServiceOffers(adminId: number): Promise<any[]> {
    const company = await this.getCompanyByAdmin(adminId);
    const today = new Date();

    const serviceOffers = await this.serviceOfferRepository
      .createQueryBuilder('so')
      .innerJoinAndSelect('so.offer', 'offer')
      .innerJoinAndSelect('so.service', 'service')
      .where('offer.companyId = :companyId', { companyId: company.id })
      .andWhere('offer.status = 1')
      .andWhere('offer.startDate <= :today', { today })
      .andWhere('offer.endDate >= :today', { today })
      .andWhere('service.status = 1')
      .orderBy('offer.id', 'ASC')
      .addOrderBy('service.name', 'ASC')
      .getMany();

    if (serviceOffers.length === 0) {
      return [];
    }

    // Agrupar por oferta
    const offerMap = new Map<number, any>();

    for (const so of serviceOffers) {
      const offer = so.offer;
      const service = so.service;

      if (!offerMap.has(offer.id)) {
        offerMap.set(offer.id, {
          offerId: offer.id,
          offerName: offer.name,
          offerLogo: offer.logo,
          offerDescription: offer.description,
          startDate: offer.startDate,
          endDate: offer.endDate,
          services: [],
        });
      }

      const originalPrice = Number(service.cost) || 0;
      const offerPrice = Number(so.price) || 0;
      const discount =
        originalPrice > 0
          ? Number(
              (((originalPrice - offerPrice) / originalPrice) * 100).toFixed(2),
            )
          : 0;

      offerMap.get(offer.id).services.push({
        serviceOfferId: so.id,   // id de service_offer
        serviceId: service.id,
        serviceName: service.name,
        serviceDescription: service.description,
        originalPrice,           // precio original del servicio
        offerPrice,              // precio con la oferta aplicada
        discount,                // % de descuento calculado
        standardTime: service.standardTime,
        currency: service.currency,
        workers: service.workers,
        percentage: service.percentage,
        offerId: offer.id,       // necesario para enviar al crear la sesión
      });
    }

    return Array.from(offerMap.values());
  }

  // ==================== MÉTODOS PRIVADOS ====================

  private async getCompanyByAdmin(adminId: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new UnauthorizedException('No tienes una compañía asignada');
    }
    return company;
  }

  private async validateServicesBelongToCompany(
    serviceIds: number[],
    companyId: number,
  ): Promise<void> {
    const services = await this.serviceRepository.find({
      where: { id: In(serviceIds), companyId },
      select: ['id'],
    });
    const validIds = services.map((s) => s.id);
    const invalidIds = serviceIds.filter((id) => !validIds.includes(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Los siguientes servicios no pertenecen a tu compañía: ${invalidIds.join(', ')}`,
      );
    }
  }
}