import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Offer } from './entities/offer.entity';
import { ServiceOffer } from './entities/service-offer.entity';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { Company } from '../company/entities/company.entity';
import { Service } from '../service/entities/service.entity';
import { FileUploadService } from '../common/services/file_upload.service';
import {
  paginate,
  PaginationOptions,
  PaginationResult,
} from '../common/utils/pagination.util';
import { RealtimeService } from '../realtime/realtime.service';
import { companyRoom, companyPublicRoom } from '../realtime/rooms';

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
    @Inject(FileUploadService)
    private fileUploadService: FileUploadService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Emite un evento de oferta a las rooms company:<id> + company-public:<id>
   * (CLYP-243). La offer no contiene datos de cliente, por lo que es seguro
   * emitir al canal público. Best-effort: no rompe la mutación.
   */
  private emitOfferEvent(
    type: string,
    entityId: number,
    companyId: number,
    data: unknown,
  ): void {
    this.realtime.emitEntity([companyRoom(companyId), companyPublicRoom(companyId)], {
      type,
      entityId,
      companyId,
      data,
    });
  }

  async findAllByCompany(
    adminId: number,
    paginationOptions: PaginationOptions & { status?: string },
  ): Promise<PaginationResult<any>> {
    const company = await this.getCompanyByAdmin(adminId);
    const { page, limit, status } = paginationOptions;
    const skip = (page - 1) * limit;

    // Filtro por estado: '1' = activa, '0' = inactiva, ausente = todas
    const where: Record<string, any> = { companyId: company.id };
    if (status !== undefined) {
      where.status = parseInt(status, 10);
    }

    const [offers, total] = await this.offerRepository.findAndCount({
      where,
      relations: ['serviceOffers', 'serviceOffers.service'],
      order: { id: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: offers.map((offer) => this.addLogoUrl(offer)),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async findAll(): Promise<any[]> {
    const offers = await this.offerRepository.find({
      relations: ['company', 'serviceOffers', 'serviceOffers.service'],
    });
    return offers.map((offer) => this.addLogoUrl(offer));
  }

  async findOne(id: number, adminId: number): Promise<any> {
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
    return this.addLogoUrl(offer);
  }

  async create(
    createOfferDto: CreateOfferDto,
    adminId: number,
    logoFile?: Express.Multer.File,
  ): Promise<any> {
    const company = await this.getCompanyByAdmin(adminId);

    if (
      new Date(createOfferDto.startDate) >= new Date(createOfferDto.endDate)
    ) {
      throw new BadRequestException('Start date must be before end date');
    }

    if (createOfferDto.serviceOffers?.length) {
      await this.validateServicesBelongToCompany(
        createOfferDto.serviceOffers.map((s) => s.serviceId),
        company.id,
      );
    }

    // Procesar logo si se envió archivo
    let logoFileName: string | undefined;
    if (logoFile) {
      const logoInfo = await this.fileUploadService.saveFile(
        logoFile,
        'offer_logo',
        'offer',
        company.id,
      );
      logoFileName = logoInfo.fileName;
    }

    const offer = this.offerRepository.create({
      ...createOfferDto,
      logo: logoFileName,
      companyId: company.id,
      serviceOffers: createOfferDto.serviceOffers?.map((item) => ({
        serviceId: item.serviceId,
        price: item.price,
      })),
    });

    const savedOffer = await this.offerRepository.save(offer);
    const full = await this.findOne(savedOffer.id, adminId);
    this.emitOfferEvent('offer.created', full.id, full.companyId, full);
    return full;
  }

  async update(
    id: number,
    updateOfferDto: UpdateOfferDto,
    adminId: number,
    logoFile?: Express.Multer.File,
  ): Promise<any> {
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
      if (
        new Date(updateOfferDto.startDate) >= new Date(updateOfferDto.endDate)
      ) {
        throw new BadRequestException('Start date must be before end date');
      }
    }

    // Procesar logo si se envió archivo
    if (logoFile) {
      // Eliminar logo anterior si existe
      if (offer.logo) {
        await this.fileUploadService.deleteFile('offer_logo', offer.logo);
      }
      const logoInfo = await this.fileUploadService.saveFile(
        logoFile,
        'offer_logo',
        'offer',
        company.id,
      );
      offer.logo = logoInfo.fileName;
    }

    const { serviceOffers, ...restDto } = updateOfferDto;
    Object.assign(offer, restDto);

    if (serviceOffers) {
      await this.validateServicesBelongToCompany(
        serviceOffers.map((s) => s.serviceId),
        company.id,
      );
      await this.serviceOfferRepository.delete({ offerId: id });
      offer.serviceOffers = serviceOffers.map((item) =>
        this.serviceOfferRepository.create({
          serviceId: item.serviceId,
          price: item.price,
        }),
      );
    }

    await this.offerRepository.save(offer);
    const full = await this.findOne(id, adminId);
    this.emitOfferEvent('offer.updated', full.id, full.companyId, full);
    return full;
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
    const offerId = offer.id;
    const companyId = offer.companyId;
    // Eliminar logo del almacenamiento si existe
    if (offer.logo) {
      await this.fileUploadService.deleteFile('offer_logo', offer.logo);
    }
    await this.offerRepository.remove(offer);
    this.emitOfferEvent('offer.deleted', offerId, companyId, { offerId });
  }

  async setStatus(id: number, status: number, adminId: number): Promise<any> {
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
    const full = await this.findOne(id, adminId);
    this.emitOfferEvent(
      status === 1 ? 'offer.activated' : 'offer.deactivated',
      full.id,
      full.companyId,
      full,
    );
    return full;
  }

  /**
   * Obtener todos los servicios en ofertas activas y vigentes de la compañía del admin (paginado).
   */
  async findActiveServiceOffers(
    adminId: number,
    paginationOptions: PaginationOptions,
  ): Promise<PaginationResult<any>> {
    const company = await this.getCompanyByAdmin(adminId);
    const today = new Date();

    const offerQuery = this.offerRepository
      .createQueryBuilder('offer')
      .where('offer.companyId = :companyId', { companyId: company.id })
      .andWhere('offer.status = 1')
      .andWhere('offer.startDate <= :today', { today })
      .andWhere('offer.endDate >= :today', { today })
      .andWhere((qb) => {
        const sub = qb
          .subQuery()
          .select('1')
          .from(ServiceOffer, 'so')
          .innerJoin('so.service', 'service')
          .where('so.offerId = offer.id')
          .andWhere('service.status = 1')
          .getQuery();
        return `EXISTS ${sub}`;
      })
      .orderBy('offer.id', 'ASC');

    const paginated = await paginate<Offer>(offerQuery, paginationOptions);

    if (paginated.data.length === 0) {
      return { ...paginated, data: [] };
    }

    const offerIds = paginated.data.map((o) => o.id);
    const grouped = await this.groupActiveServiceOffersByIds(offerIds);

    return {
      ...paginated,
      data: paginated.data
        .map((o) => grouped.get(o.id))
        .filter((g): g is any => Boolean(g)),
    };
  }

  /**
   * Obtener todos los servicios en ofertas activas y vigentes de una compañía por ID.
   * Accesible para admin, worker y cliente (no requiere pertenencia).
   */
  async findActiveServiceOffersByCompanyId(companyId: number): Promise<any[]> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with id ${companyId} not found`);
    }
    return this.fetchActiveServiceOffersByCompanyId(companyId);
  }

  private async fetchActiveServiceOffersByCompanyId(
    companyId: number,
  ): Promise<any[]> {
    const today = new Date();

    const serviceOffers = await this.serviceOfferRepository
      .createQueryBuilder('so')
      .innerJoinAndSelect('so.offer', 'offer')
      .innerJoinAndSelect('so.service', 'service')
      .where('offer.companyId = :companyId', { companyId })
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
          offerLogoUrl: offer.logo
            ? this.fileUploadService.getFileUrl('offer_logo', offer.logo)
            : null,
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
        serviceOfferId: so.id, // id de service_offer
        serviceId: service.id,
        serviceName: service.name,
        serviceDescription: service.description,
        originalPrice, // precio original del servicio
        offerPrice, // precio con la oferta aplicada
        discount, // % de descuento calculado
        standardTime: service.standardTime,
        currency: service.currency,
        workers: service.workers,
        percentage: service.percentage,
        offerId: offer.id, // necesario para enviar al crear la sesión
      });
    }

    return Array.from(offerMap.values());
  }

  /**
   * Job de vencimiento/activación por tiempo (CLYP-243). Notify-only: NO cambia
   * el status en BD. Corre a diario y, usando una ventana de un día, emite:
   *  - offer.expired   → ofertas activas cuyo endDate cayó AYER (acaban de vencer).
   *  - offer.activated → ofertas activas cuyo startDate es HOY y siguen vigentes.
   * El status queda como switch manual del admin; la vigencia es por fecha.
   * No requiere acción de usuario. Best-effort por evento.
   */
  async processScheduledOfferTransitions(): Promise<{
    expired: number;
    activated: number;
  }> {
    const now = new Date();
    const today = this.toDateStr(now);
    const yesterday = this.toDateStr(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
    );
    const tomorrow = this.toDateStr(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
    );

    // VENCIDAS: status activo y endDate == ayer (rango [ayer, hoy)).
    const expiredOffers = await this.offerRepository
      .createQueryBuilder('offer')
      .where('offer.status = 1')
      .andWhere('offer.endDate >= :yesterday', { yesterday })
      .andWhere('offer.endDate < :today', { today })
      .getMany();

    for (const offer of expiredOffers) {
      this.emitOfferEvent('offer.expired', offer.id, offer.companyId, {
        offerId: offer.id,
      });
    }

    // ACTIVADAS: status activo, startDate == hoy (rango [hoy, mañana)) y aún
    // vigente (endDate >= hoy). Payload con la offer completa.
    const activatedOffers = await this.offerRepository
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.serviceOffers', 'so')
      .leftJoinAndSelect('so.service', 'service')
      .where('offer.status = 1')
      .andWhere('offer.startDate >= :today', { today })
      .andWhere('offer.startDate < :tomorrow', { tomorrow })
      .andWhere('offer.endDate >= :today', { today })
      .getMany();

    for (const offer of activatedOffers) {
      this.emitOfferEvent(
        'offer.activated',
        offer.id,
        offer.companyId,
        this.addLogoUrl(offer),
      );
    }

    return { expired: expiredOffers.length, activated: activatedOffers.length };
  }

  /** Formatea una fecha a 'YYYY-MM-DD' usando componentes locales. */
  private toDateStr(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // ==================== MÉTODOS PRIVADOS ====================

  private async groupActiveServiceOffersByIds(
    offerIds: number[],
  ): Promise<Map<number, any>> {
    const serviceOffers = await this.serviceOfferRepository
      .createQueryBuilder('so')
      .innerJoinAndSelect('so.offer', 'offer')
      .innerJoinAndSelect('so.service', 'service')
      .where('so.offerId IN (:...offerIds)', { offerIds })
      .andWhere('service.status = 1')
      .orderBy('offer.id', 'ASC')
      .addOrderBy('service.name', 'ASC')
      .getMany();

    const offerMap = new Map<number, any>();

    for (const so of serviceOffers) {
      const offer = so.offer;
      const service = so.service;

      if (!offerMap.has(offer.id)) {
        offerMap.set(offer.id, {
          offerId: offer.id,
          offerName: offer.name,
          offerLogo: offer.logo,
          offerLogoUrl: offer.logo
            ? this.fileUploadService.getFileUrl('offer_logo', offer.logo)
            : null,
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
        serviceOfferId: so.id,
        serviceId: service.id,
        serviceName: service.name,
        serviceDescription: service.description,
        originalPrice,
        offerPrice,
        discount,
        standardTime: service.standardTime,
        currency: service.currency,
        workers: service.workers,
        percentage: service.percentage,
        offerId: offer.id,
      });
    }

    return offerMap;
  }

  private addLogoUrl(offer: Offer): any {
    return {
      ...offer,
      logoUrl: offer.logo
        ? this.fileUploadService.getFileUrl('offer_logo', offer.logo)
        : null,
    };
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
