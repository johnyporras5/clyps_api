import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Company } from '../company/entities/company.entity';
import { CalendarCompany } from '../calendar_company/entities/calendar-company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Service } from '../service/entities/service.entity';
import { Session } from '../session/entities/session.entity';
import { User } from '../user/entities/user.entity';
import { Client } from '../client/entities/client.entity';
import { isClientInactiveForCompany } from '../client/client-activation.util';
import { ServiceService } from '../service/service.service';
import { OfferService } from '../Offer/offer.service';
import { PortfolioPicturesService } from '../portfolio_pictures/portfolio_pictures.service';
import { SessionService } from '../session/session.service';
import { SessionRealtimeEmitter } from '../session/session-realtime.emitter';
import { SessionNotificationEmitter } from '../session/session-notification.emitter';
import { EmailService } from '../email/email.service';
import { generateUniqueUsername } from '../common/utils/username.util';
import { EntitlementsService } from '../subscription/entitlements.service';
import { generateSimplePassword } from '../auth/password.util';
import { normalizeCompanyCalendarDetail } from '../common/utils/company-calendar.util';
import { isWithinOpenHours } from './booking-hours.util';
import { generateUniqueWorkerSlug } from '../company_worker/company-worker-slug.util';
import {
  CreatePublicBookingDto,
  PublicAvailabilityQueryDto,
} from './dto/create-public-booking.dto';

/** Menos que esto llenando el formulario es un bot, no una persona. */
const MIN_FORM_ELAPSED_MS = 3000;
/** Hasta cuántos días hacia adelante se puede reservar desde el enlace. */
const MAX_DAYS_AHEAD = 180;
const PORTFOLIO_LIMIT = 24;

type ServiceWorkerAssignment = {
  id: number;
  percentage?: number;
  time?: number;
  cost?: number;
};

/**
 * Reserva pública desde el enlace del negocio (/reservar/<slug>), sin cuenta.
 *
 * Todo lo que sale de aquí es PÚBLICO: los endpoints internos que ya devuelven
 * esta información (servicios con workers, perfil de la compañía) incluyen
 * correos, teléfonos y porcentajes de comisión, así que aquí se reutiliza su
 * lógica pero se arma la respuesta con una lista blanca de campos.
 */
@Injectable()
export class PublicBookingService {
  private readonly logger = new Logger(PublicBookingService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CalendarCompany)
    private readonly calendarCompanyRepository: Repository<CalendarCompany>,
    @InjectRepository(CompanyWorker)
    private readonly companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Service)
    private readonly serviceRepository: Repository<Service>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly serviceService: ServiceService,
    private readonly offerService: OfferService,
    private readonly portfolioService: PortfolioPicturesService,
    private readonly sessionService: SessionService,
    private readonly realtimeEmitter: SessionRealtimeEmitter,
    private readonly notificationEmitter: SessionNotificationEmitter,
    private readonly emailService: EmailService,
    private readonly entitlements: EntitlementsService,
  ) {}

  // ─────────────────────────── Perfil público ───────────────────────────

  async getProfile(slug: string) {
    const company = await this.findCompanyBySlug(slug);

    // Las reseñas NO se publican aquí: el comentario es texto libre del
    // cliente y puede traer datos personales. Solo va el promedio (rating).
    const [booking, offers, portfolio, bookable] = await Promise.all([
      this.serviceService.findAllByCompanyIdWithWorkers(
        company.id,
        { page: 1, limit: 500 },
        'cli',
      ),
      this.offerService
        .findActiveServiceOffersByCompanyId(company.id)
        .catch(() => []),
      this.portfolioService
        .findAllByCompany(company.id, { page: 1, limit: PORTFOLIO_LIMIT })
        .catch(() => ({ data: [] as any[] })),
      this.entitlements.canOperate(company.id),
    ]);

    const info = booking.company ?? {};

    return {
      company: {
        id: company.id,
        slug: company.slug,
        name: company.name,
        location: company.location,
        address: company.address,
        description: company.description,
        phone: company.phone,
        instagramUrl: company.instagramUrl,
        tiktokUrl: company.tiktokUrl,
        facebookUrl: company.facebookUrl,
        logoUrl: info.logoUrl ?? null,
        schedule: normalizeCompanyCalendarDetail(info.schedule),
        rating: info.rating ?? { average: 0, total: 0 },
      },
      bookable,
      services: (booking.data ?? []).map((s: any) => this.toPublicService(s)),
      offers: (offers ?? []).map((o: any) => ({
        offerId: o.offerId,
        offerName: o.offerName,
        offerLogoUrl: o.offerLogoUrl,
        offerDescription: o.offerDescription,
        startDate: o.startDate,
        endDate: o.endDate,
        services: (o.services ?? []).map((s: any) => ({
          serviceId: s.serviceId,
          serviceName: s.serviceName,
          serviceDescription: s.serviceDescription,
          originalPrice: s.originalPrice,
          offerPrice: s.offerPrice,
          discount: s.discount,
          standardTime: s.standardTime,
          currency: s.currency,
          offerId: s.offerId,
        })),
      })),
      portfolio: (portfolio?.data ?? []).map((p: any) => ({
        id: p.id,
        pictureUrl: p.pictureUrl,
      })),
    };
  }

  /**
   * Página de un profesional (/reservar/<negocio>/<profesional>): los datos
   * del negocio, el profesional, y SOLO los servicios que él hace, cada uno ya
   * con él como único profesional. Sin ofertas ni portafolio.
   */
  async getWorkerProfile(slug: string, workerSlug: string) {
    const company = await this.findCompanyBySlug(slug);
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: {
        companyId: company.id,
        slug: (workerSlug ?? '').trim().toLowerCase(),
      },
    });

    if (!companyWorker) {
      throw new NotFoundException({
        message: 'No encontramos este profesional.',
        reason: 'worker_not_found',
        companyName: company.name,
        companySlug: company.slug,
      });
    }
    if (
      companyWorker.isActive !== 1 ||
      companyWorker.temporarilyDeleted ||
      companyWorker.permanentlyDeleted
    ) {
      throw new NotFoundException({
        message: `Este profesional ya no está disponible en ${company.name}.`,
        reason: 'worker_unavailable',
        companyName: company.name,
        companySlug: company.slug,
      });
    }

    const profile = await this.getProfile(slug);
    const cwId = companyWorker.id;

    const isThisWorker = (w: { companyWorkerId?: number }) =>
      Number(w.companyWorkerId) === cwId;

    const services = profile.services
      .filter((s) => s.workersInfo.some(isThisWorker))
      .map((s) => ({
        ...s,
        workers: s.workers.filter((w) => Number(w.id) === cwId),
        workersInfo: s.workersInfo.filter(isThisWorker),
      }));

    const workerInfo = services[0]?.workersInfo[0] as
      | {
          workerInfo?: {
            name?: string;
            pictureUrl?: string | null;
            rating?: { average: number; total: number };
          };
        }
      | undefined;

    return {
      ...profile,
      services,
      offers: [],
      portfolio: [],
      worker: {
        companyWorkerId: cwId,
        slug: companyWorker.slug,
        name: workerInfo?.workerInfo?.name ?? companyWorker.worker?.name ?? '',
        pictureUrl: workerInfo?.workerInfo?.pictureUrl ?? null,
        rating: workerInfo?.workerInfo?.rating ?? { average: 0, total: 0 },
      },
    };
  }

  /**
   * Enlaces de reservas del trabajador autenticado: uno por cada negocio en el
   * que está activo. Si algún registro viejo quedó sin slug, se le asigna.
   */
  async getMyBookingLinks(userId: number) {
    const companyWorkers = await this.companyWorkerRepository.find({
      // `company_worker.user_id` no siempre está lleno; el vínculo fiable con
      // el usuario es `worker.user_id`.
      where: {
        worker: { userId },
        isActive: 1,
        temporarilyDeleted: false,
        permanentlyDeleted: false,
      },
      relations: ['worker', 'company'],
    });

    const links: {
      companyId: number;
      companyName: string;
      companySlug: string | null;
      workerSlug: string;
    }[] = [];

    for (const cw of companyWorkers) {
      if (!cw.slug) {
        cw.slug = await generateUniqueWorkerSlug(
          this.companyWorkerRepository.manager,
          cw.companyId,
          cw.worker?.name,
        );
        await this.companyWorkerRepository.update(cw.id, { slug: cw.slug });
      }
      links.push({
        companyId: cw.companyId,
        companyName: cw.company?.name ?? '',
        companySlug: cw.company?.slug ?? null,
        workerSlug: cw.slug,
      });
    }
    return links;
  }

  /** Servicio con solo lo que necesita la página de reservas. */
  private toPublicService(service: any) {
    const assignments: ServiceWorkerAssignment[] = Array.isArray(
      service.workers,
    )
      ? service.workers
      : [];

    const workersInfo = (service.workersInfo ?? [])
      .filter((w: any) => w && !w.error && w.companyWorkerId)
      .map((w: any) => ({
        companyWorkerId: w.companyWorkerId,
        workerInfo: {
          id: w.workerInfo?.id,
          name: w.workerInfo?.name,
          pictureUrl: w.workerInfo?.pictureUrl ?? null,
          rating: w.workerInfo?.rating ?? { average: 0, total: 0 },
        },
        companyWorkerInfo: {
          isActive: w.companyWorkerInfo?.isActive,
          calendar: w.companyWorkerInfo?.calendar ?? null,
        },
      }));

    const activeIds = new Set(
      workersInfo.map((w: any) => Number(w.companyWorkerId)),
    );

    return {
      id: service.id,
      name: service.name,
      description: service.description,
      cost: service.cost,
      currency: service.currency,
      standardTime: service.standardTime,
      categoryId: service.categoryId,
      category: service.category
        ? { id: service.category.id, name: service.category.name }
        : null,
      // Tiempo y precio por trabajador; sin el porcentaje de comisión.
      workers: assignments
        .filter((a) => activeIds.has(Number(a.id)))
        .map((a) => ({
          id: a.id,
          time: typeof a.time === 'number' ? a.time : service.standardTime,
          ...(a.cost !== undefined && a.cost !== null ? { cost: a.cost } : {}),
        })),
      workersInfo,
    };
  }

  // ─────────────────────────── Disponibilidad ───────────────────────────

  async getAvailability(slug: string, query: PublicAvailabilityQueryDto) {
    const company = await this.findCompanyBySlug(slug);
    return this.sessionService.getAvailability({
      companyId: company.id,
      date: query.date,
      companyWorkerId: query.companyWorkerId,
    });
  }

  // ─────────────────────────── Crear la reserva ───────────────────────────

  async createBooking(slug: string, dto: CreatePublicBookingDto) {
    // Anti-bots: el campo oculto lleno o un formulario llenado en menos de 3 s.
    if (
      (dto.website && dto.website.trim() !== '') ||
      (typeof dto.elapsedMs === 'number' && dto.elapsedMs < MIN_FORM_ELAPSED_MS)
    ) {
      this.logger.warn(`Reserva pública descartada por anti-bot (${slug})`);
      throw new BadRequestException(
        'No pudimos procesar la reserva. Intenta de nuevo.',
      );
    }

    const company = await this.findCompanyBySlug(slug);

    if (!(await this.entitlements.canOperate(company.id))) {
      throw new ForbiddenException({
        message: `${company.name} no está recibiendo reservas en este momento. Intenta más tarde.`,
        reason: 'company_not_bookable',
      });
    }

    await this.validateDetails(company.id, dto);

    const { user, client, isNewUser, password } = await this.resolveGuestClient(
      dto,
      company,
    );

    const startTimes = dto.details.map((d) =>
      new Date(d.detailStartDatetime).getTime(),
    );
    const sessionDatetime = new Date(Math.min(...startTimes));

    let result: Awaited<ReturnType<SessionService['createSessionByClient']>>;
    try {
      result = await this.sessionService.createSessionByClient(
        {
          sessionDatetime,
          details: dto.details.map((d) => ({
            serviceId: d.serviceId,
            companyWorkerId: d.companyWorkerId,
            detailStartDatetime: new Date(d.detailStartDatetime),
            ...(d.offerId ? { offerId: d.offerId } : {}),
          })),
        },
        user.id,
      );
    } catch (error) {
      // Si la cuenta se creó solo para esta reserva y la cita no salió (p. ej.
      // otro tomó el horario), se deshace: no se deja una cuenta huérfana ni se
      // le mandan credenciales de algo que no reservó.
      if (isNewUser) await this.rollbackGuest(user.id, client.id);
      throw error;
    }

    const sessionId = result?.createdDetails?.[0]?.sessionId;
    if (!result?.isNew || !sessionId) {
      if (isNewUser) await this.rollbackGuest(user.id, client.id);
      throw new ConflictException(
        'Ya tienes una cita reservada con estos mismos datos.',
      );
    }

    // Mismo efecto que una cita creada desde la app: agenda en tiempo real y
    // push al negocio. El actor es el cliente (no se le notifica a sí mismo).
    await this.realtimeEmitter.emitCreated(sessionId);
    await this.notificationEmitter.notifyCreated(sessionId, user.id);

    if (isNewUser && password) {
      this.emailService
        .sendClientCredentials(user.email, user.username, password)
        .catch((err) =>
          this.logger.error('Error enviando credenciales al invitado', err),
        );
    }

    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      select: { id: true, publicCode: true },
    });

    return {
      sessionId,
      publicCode: session?.publicCode ?? null,
      email: user.email,
      isNewAccount: isNewUser,
    };
  }

  /**
   * Validaciones que en la app del cliente solo hace el front y que aquí,
   * siendo un endpoint abierto, hacen falta en el servidor: que cada servicio
   * sea de este negocio y esté visible para clientes, que el trabajador haga
   * ese servicio, y que la hora caiga dentro del horario de atención.
   */
  private async validateDetails(
    companyId: number,
    dto: CreatePublicBookingDto,
  ): Promise<void> {
    const serviceIds = [...new Set(dto.details.map((d) => d.serviceId))];
    const workerIds = [...new Set(dto.details.map((d) => d.companyWorkerId))];

    const [services, companyWorkers, calendar] = await Promise.all([
      this.serviceRepository.find({
        where: { id: In(serviceIds), companyId, status: 1 },
      }),
      this.companyWorkerRepository.find({
        where: { id: In(workerIds), companyId, isActive: 1 },
      }),
      this.calendarCompanyRepository.findOne({ where: { companyId } }),
    ]);

    const serviceById = new Map(services.map((s) => [s.id, s]));
    const workerById = new Map(companyWorkers.map((cw) => [cw.id, cw]));
    const now = Date.now();
    const maxAhead = now + MAX_DAYS_AHEAD * 24 * 60 * 60_000;

    for (const detail of dto.details) {
      const service = serviceById.get(detail.serviceId);
      if (!service || service.forCommunity) {
        throw new BadRequestException(
          'Uno de los servicios no está disponible.',
        );
      }

      const worker = workerById.get(detail.companyWorkerId);
      const assignments: ServiceWorkerAssignment[] = Array.isArray(
        service.workers,
      )
        ? (service.workers as ServiceWorkerAssignment[])
        : [];
      const assignment = assignments.find(
        (a) => Number(a.id) === detail.companyWorkerId,
      );
      if (!worker || !assignment) {
        throw new BadRequestException(
          `El profesional elegido no realiza "${service.name}".`,
        );
      }

      const start = new Date(detail.detailStartDatetime);
      if (Number.isNaN(start.getTime())) {
        throw new BadRequestException('La fecha de la cita no es válida.');
      }
      // El cliente de la app ve slots desde ahora + 1 h; se deja 5 min de
      // margen por la diferencia de relojes.
      if (start.getTime() < now + 55 * 60_000) {
        throw new BadRequestException(
          'Ese horario ya no está disponible. Elige otro.',
        );
      }
      if (start.getTime() > maxAhead) {
        throw new BadRequestException(
          `Solo se puede reservar hasta ${MAX_DAYS_AHEAD} días por adelantado.`,
        );
      }

      const durationMinutes =
        typeof assignment.time === 'number'
          ? assignment.time
          : Number(service.standardTime) || 0;

      const open = isWithinOpenHours({
        start,
        durationMinutes,
        companyCalendarDetail: calendar?.calendarDetail,
        workerCalendar: worker.calendar,
      });
      if (!open) {
        throw new BadRequestException(
          `El horario elegido para "${service.name}" está fuera del horario de atención.`,
        );
      }
    }
  }

  /**
   * Cliente por correo: si ya existe se reutiliza (y `createSessionByClient`
   * lo vincula al negocio); si no, se crea con username automático y una
   * contraseña que se le envía por correo SOLO si la cita se confirma.
   */
  private async resolveGuestClient(
    dto: CreatePublicBookingDto,
    company: Company,
  ): Promise<{
    user: User;
    client: Client;
    isNewUser: boolean;
    password?: string;
  }> {
    const email = dto.email;
    const { firstName, lastName } = splitName(dto.name);

    const existingUser = await this.userRepository
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email })
      .getOne();

    if (existingUser) {
      if (existingUser.userType !== 'cli') {
        throw new ConflictException(
          'Este correo ya está registrado en Clyps con otro tipo de cuenta. Usa otro correo para reservar.',
        );
      }

      let client = await this.clientRepository.findOne({
        where: { userId: existingUser.id },
      });

      if (client && isClientInactiveForCompany(client, company.id)) {
        throw new ForbiddenException(
          `No es posible reservar en ${company.name} con este correo. Contacta directamente al negocio.`,
        );
      }

      if (!client) {
        client = await this.clientRepository.save(
          this.clientRepository.create({
            name: firstName,
            lastName,
            email,
            isActive: 1,
            companies: [],
            userId: existingUser.id,
          }),
        );
      } else if (!client.name) {
        // Completa el nombre si su ficha no lo tenía; nunca pisa uno existente.
        await this.clientRepository.update(client.id, {
          name: firstName,
          lastName: client.lastName || lastName,
        });
      }

      return { user: existingUser, client, isNewUser: false };
    }

    const password = generateSimplePassword();
    const user = await this.userRepository.save(
      this.userRepository.create({
        username: await generateUniqueUsername(
          this.userRepository,
          dto.name,
          email,
        ),
        email,
        password: await bcrypt.hash(password, 10),
        userType: 'cli',
        emailVerified: 0,
      }),
    );

    // `companies` arranca vacío: createSessionByClient agrega el negocio y
    // registra la fecha de primera cita al crear la sesión.
    const client = await this.clientRepository.save(
      this.clientRepository.create({
        name: firstName,
        lastName,
        email,
        isActive: 1,
        companies: [],
        userId: user.id,
      }),
    );

    return { user, client, isNewUser: true, password };
  }

  private async rollbackGuest(userId: number, clientId: number) {
    try {
      await this.clientRepository.delete(clientId);
      await this.userRepository.delete(userId);
    } catch (err) {
      this.logger.error(
        `No se pudo deshacer la cuenta invitada (user ${userId})`,
        err as Error,
      );
    }
  }

  private async findCompanyBySlug(slug: string): Promise<Company> {
    const normalized = (slug ?? '').trim().toLowerCase();
    const company = normalized
      ? await this.companyRepository.findOne({ where: { slug: normalized } })
      : null;
    if (!company) {
      throw new NotFoundException('No encontramos este negocio.');
    }
    return company;
  }
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.shift() ?? '';
  return { firstName, lastName: parts.join(' ') };
}
