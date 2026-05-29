import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, In, MoreThan } from 'typeorm';
import { Client } from './entities/client.entity';
import { User } from '../user/entities/user.entity';
import { Company } from '../company/entities/company.entity';
import { Session } from '../session/entities/session.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { Service } from '../service/entities/service.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Offer } from '../Offer/entities/offer.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import {
  AllowedFolder,
  FileUploadService,
} from '../common/services/file_upload.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { SetCompanyAliasDto } from './dto/set-company-alias.dto';

@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);
  private readonly CLIENT_PHOTO_FOLDER: AllowedFolder = 'client_photo';

  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @InjectRepository(SessionDetail)
    private sessionDetailRepository: Repository<SessionDetail>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Offer)
    private offerRepository: Repository<Offer>,
    private fileUploadService: FileUploadService,
  ) {}

  /**
   * Construye el resumen de una sesión (compañía + servicios) para el perfil del cliente.
   */
  private async buildAppointmentSummary(session: Session): Promise<{
    sessionId: number;
    sessionDatetime: Date;
    sessionStatus: number;
    companyName: string | null;
    services: string[];
    offerName: string | null;
  }> {
    const details = await this.sessionDetailRepository.find({
      where: { sessionId: session.id },
    });

    let companyName: string | null = null;
    let offerName: string | null = null;
    const services: string[] = [];

    if (details.length > 0) {
      const serviceIds = [
        ...new Set(details.map((d) => d.serviceId).filter(Boolean)),
      ];
      const companyWorkerIds = [
        ...new Set(details.map((d) => d.companyWorkerId).filter(Boolean)),
      ];
      const offerIds = [
        ...new Set(details.map((d) => d.offerId).filter(Boolean)),
      ];

      if (serviceIds.length > 0) {
        const serviceRows = await this.serviceRepository.find({
          where: { id: In(serviceIds) },
          select: ['id', 'name'],
        });
        const serviceMap = new Map(serviceRows.map((s) => [s.id, s.name]));
        for (const d of details) {
          const name = serviceMap.get(d.serviceId);
          if (name) services.push(name);
        }
      }

      if (offerIds.length > 0) {
        const offer = await this.offerRepository.findOne({
          where: { id: In(offerIds) },
          relations: ['company'],
        });
        offerName = offer?.name ?? null;
        companyName = offer?.company?.name ?? null;
      }

      if (!companyName && companyWorkerIds.length > 0) {
        const companyWorker = await this.companyWorkerRepository.findOne({
          where: { id: In(companyWorkerIds) },
          relations: ['company'],
        });
        companyName = companyWorker?.company?.name ?? null;
      }
    }

    return {
      sessionId: session.id,
      sessionDatetime: session.sessionDatetime,
      sessionStatus: session.sessionStatus,
      companyName,
      services,
      offerName,
    };
  }

  /**
   * Última cita completada (sessionStatus 3 = Completada, 4 = Pagada) del cliente.
   */
  private async getLastCompletedAppointment(clientId: number) {
    const session = await this.sessionRepository.findOne({
      where: { clientId, sessionStatus: In([3, 4]) },
      order: { sessionDatetime: 'DESC' },
    });
    if (!session) return null;
    return this.buildAppointmentSummary(session);
  }

  /**
   * Próxima cita del cliente: futura y no cancelada (status 1 = Agendado, 8 = Pendiente).
   */
  private async getNextAppointment(clientId: number) {
    // Las sesiones se guardan con hora local Venezuela (UTC-4) como si fuera UTC,
    // así que "ahora" para la comparación debe estar en el mismo wallclock.
    const VENEZUELA_OFFSET_MS = 4 * 60 * 60 * 1000;
    const nowVenezuela = new Date(Date.now() - VENEZUELA_OFFSET_MS);

    const session = await this.sessionRepository.findOne({
      where: {
        clientId,
        sessionStatus: In([1, 8]),
        sessionDatetime: MoreThan(nowVenezuela),
      },
      order: { sessionDatetime: 'ASC' },
    });
    if (!session) return null;
    return this.buildAppointmentSummary(session);
  }

  /**
   * Endpoint para listar clientes para un administrador
   * @param adminId ID del usuario administrador autenticado
   * @param options Opciones de paginación
   * @returns Lista paginada de clientes
   *
   * Lógica de visibilidad:
   * - Cliente PÚBLICO (isPublic = 1): Visible para CUALQUIER admin logueado
   * - Cliente PRIVADO (isPublic = 0): Solo visible para admins cuyas compañías están en el array companies del cliente
   */
  async findAllByAdminCompanies(
    adminId: number,
    options: PaginationDto,
  ): Promise<PaginationResult<any>> {
    this.logger.log(
      `=== SERVICE: LISTANDO CLIENTES PARA ADMIN ID: ${adminId} ===`,
    );

    await this.validateUserExists(adminId);

    // 1. Obtener las compañías del admin (si las tiene)
    const adminCompanies = await this.companyRepository.find({
      where: { userId: adminId },
    });

    const adminCompanyIds = adminCompanies.map((company) => company.id);
    this.logger.log(
      `[DEBUG] IDs de compañías del admin ${adminId}: ${adminCompanyIds}`,
    );

    // 2. Construir query con la nueva lógica (SIN isPublic)
    const queryBuilder = this.clientRepository
      .createQueryBuilder('client')
      .leftJoinAndSelect('client.user', 'user')
      .where('client.isActive = :isActive', { isActive: 1 });

    // 3. Aplicar condiciones de visibilidad (SIN isPublic)
    if (adminCompanyIds.length === 0) {
      // Admin SIN compañías: Solo puede ver clientes que él mismo creó
      queryBuilder.andWhere('client.userId = :adminId', { adminId });
    } else {
      // Admin CON compañías: Puede ver:
      // a) Clientes que él creó
      // b) Clientes que comparten compañías con el admin
      queryBuilder.andWhere(
        new Brackets((qb) => {
          // Condición para clientes que el admin creó
          qb.where('client.userId = :adminId', { adminId })

            // O condición para clientes que comparten compañías
            .orWhere(
              new Brackets((sharedQb) => {
                const companyConditions = adminCompanyIds
                  .map(
                    (companyId, index) =>
                      `JSON_CONTAINS(client.companies, :companyId${index})`,
                  )
                  .join(' OR ');

                if (companyConditions) {
                  sharedQb.where(`(${companyConditions})`);
                }
              }),
            );
        }),
      );

      // Asignar parámetros para cada compañía
      adminCompanyIds.forEach((companyId, index) => {
        queryBuilder.setParameter(
          `companyId${index}`,
          JSON.stringify(companyId),
        );
      });
    }

    // 4. Aplicar paginación
    const result = await paginate(queryBuilder, {
      page: options.page,
      limit: options.limit,
    });

    this.logger.log(
      `[DEBUG] Total de clientes encontrados: ${result.meta.total}`,
    );

    // 5. Obtener fecha de última cita para cada cliente de la página
    const lastAppointmentByClient = await this.getLastAppointmentMap(
      result.data.map((c) => c.id),
    );

    // 6. Enriquecer datos de respuesta (SIN referencias a isPublic)
    return {
      data: this.enrichClientData(
        result.data,
        adminCompanies,
        adminCompanyIds,
        adminId,
        lastAppointmentByClient,
      ),
      meta: result.meta,
    };
  }

  /**
   * Devuelve un Map<clientId, lastSessionDatetime> para un conjunto de clientes,
   * usando una sola consulta agregada.
   */
  private async getLastAppointmentMap(
    clientIds: number[],
  ): Promise<Map<number, Date>> {
    const map = new Map<number, Date>();
    if (clientIds.length === 0) return map;

    const rows = await this.sessionRepository
      .createQueryBuilder('s')
      .select('s.client_id', 'clientId')
      .addSelect('MAX(s.session_datetime)', 'lastDate')
      .where('s.client_id IN (:...clientIds)', { clientIds })
      .groupBy('s.client_id')
      .getRawMany();

    for (const row of rows) {
      if (row.lastDate) {
        map.set(Number(row.clientId), new Date(row.lastDate));
      }
    }
    return map;
  }
  /**
   * Enriquecer datos del cliente para la respuesta
   */
  private enrichClientData(
    clients: Client[],
    adminCompanies: Company[],
    adminCompanyIds: number[],
    adminId: number,
    lastAppointmentByClient: Map<number, Date> = new Map(),
  ): any[] {
    return clients.map((client) => {
      let sharedCompanies: Company[] = [];
      let visibilityReason = '';

      // Determinar compañías compartidas
      if (client.companies && client.companies.length > 0) {
        sharedCompanies = adminCompanies.filter((company) =>
          client.companies.includes(company.id),
        );
      }

      // Determinar la razón de visibilidad (SIN lógica de isPublic)
      if (client.userId === adminId) {
        visibilityReason = 'Cliente propio (creado por ti)';
      } else if (sharedCompanies.length > 0) {
        visibilityReason = `Cliente afiliado a ${sharedCompanies.length} de tus compañías`;
      } else {
        visibilityReason = 'Cliente visible por herencia de compañía';
      }

      // Alias que alguna de las compañías del admin le puso a este cliente
      const aliasEntry = (client.companyAliases ?? []).find((a) =>
        adminCompanyIds.includes(Number(a.companyId)),
      );

      return {
        ...client,
        pictureUrl: client.picture
          ? this.fileUploadService.getFileUrl('client_photo', client.picture)
          : null,
        sharedCompanies,
        alias: aliasEntry?.alias ?? null,
        displayName: aliasEntry?.alias
          ? aliasEntry.alias
          : `${client.name || ''} ${client.lastName || ''}`.trim(),
        isOwner: client.userId === adminId,
        visibility: client.userId === adminId ? 'propio' : 'compartido',
        visibilityReason,
        sharedCompaniesCount: sharedCompanies.length,
        lastAppointmentDate: lastAppointmentByClient.get(client.id) ?? null,
        // Información adicional útil
        hasAccess: client.userId === adminId || sharedCompanies.length > 0,
        accessibleToAdmin:
          adminCompanyIds.length > 0 || client.userId === adminId,
      };
    });
  }

  /**
   * Validar que el usuario exista
   */
  private async validateUserExists(userId: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException(
        `Error: Usuario con ID ${userId} no encontrado`,
      );
    }
  }

  async updateProfileWithPhoto(
    userId: number,
    updateClientDto: UpdateClientDto,
    photoFile?: Express.Multer.File,
  ): Promise<Client> {
    // 1. Buscar cliente por userId
    const client = await this.clientRepository.findOne({
      where: { userId },
      relations: ['user'], // Opcional, si quieres devolver el user
    });

    if (!client) {
      throw new NotFoundException(
        `Perfil de cliente para el usuario ${userId} no encontrado`,
      );
    }

    // 2. Procesar foto si se envía
    if (photoFile) {
      try {
        const photoInfo = await this.fileUploadService.saveFile(
          photoFile,
          this.CLIENT_PHOTO_FOLDER,
          'client',
          userId,
        );

        // Eliminar foto anterior
        if (client.picture) {
          await this.fileUploadService.deleteFile(
            this.CLIENT_PHOTO_FOLDER,
            client.picture,
          );
        }

        // Asignar nuevo nombre de archivo al DTO
        updateClientDto.picture = photoInfo.fileName;
      } catch (error) {
        this.logger.error('Error al guardar la foto del cliente:', error);
        throw new BadRequestException('Error al guardar la foto de perfil');
      }
    }

    // 3. Campos permitidos (exactamente los que puede actualizar el cliente)
    const allowedFields = [
      'name',
      'lastName',
      'email',
      'phone',
      'birthDate',
      'location',
      'isActive',
      'picture',
      'companies',
    ];

    // 4. Preparar objeto con actualizaciones, con conversiones necesarias
    const updates: Partial<Client> = {};

    Object.keys(updateClientDto).forEach((key) => {
      if (!allowedFields.includes(key) || updateClientDto[key] === undefined) {
        return;
      }

      let value = updateClientDto[key];

      // Conversiones para datos que vienen como string (form-data)
      if (key === 'birthDate' && typeof value === 'string') {
        value = new Date(value);
      }
      if (key === 'isActive' && value !== undefined) {
        value = Number(value);
      }
      if (key === 'companies' && typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          throw new BadRequestException(
            'El campo companies debe ser un array JSON válido',
          );
        }
      }

      updates[key] = value;
    });

    // 5. Ignorar campos restringidos (id, userId, user)
    const restrictedFields = ['id', 'userId', 'user'];
    const attemptedRestrictedUpdates = Object.keys(updateClientDto).filter(
      (key) =>
        restrictedFields.includes(key) && updateClientDto[key] !== undefined,
    );
    if (attemptedRestrictedUpdates.length > 0) {
      this.logger.warn(
        `Intento de modificación de campos restringidos ignorado: ${attemptedRestrictedUpdates}`,
      );
    }

    // 6. Aplicar cambios y guardar
    Object.assign(client, updates);
    return await this.clientRepository.save(client);
  }

  /**
   * Obtener perfil del cliente por userId (para el cliente autenticado)
   * @param userId ID del usuario cliente
   * @returns Cliente con URL de foto y usuario sin contraseña
   */
  async findByUserId(userId: number): Promise<Client & { photoUrl: string }> {
    const client = await this.clientRepository.findOne({
      where: { userId },
      relations: ['user'], // Cargar la relación con User
    });

    if (!client) {
      throw new NotFoundException(
        `Perfil de cliente para el usuario ${userId} no encontrado`,
      );
    }

    // Generar URL completa de la foto
    const photoUrl = await this.getClientPhotoUrl(client.id);

    const [lastAppointment, nextAppointment] = await Promise.all([
      this.getLastCompletedAppointment(client.id),
      this.getNextAppointment(client.id),
    ]);

    // Excluir la contraseña del objeto User
    if (client.user) {
      const { password, ...userWithoutPassword } = client.user;
      client.user = userWithoutPassword as any;
    }

    return {
      ...client,
      photoUrl,
      lastAppointment,
      nextAppointment,
    } as any;
  }

  /**
   * Obtener perfil de un cliente por su clientId (para el administrador)
   */
  async findByClientId(
    clientId: number,
  ): Promise<Client & { photoUrl: string }> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
      relations: ['user'],
    });

    if (!client) {
      throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
    }

    const photoUrl = await this.getClientPhotoUrl(clientId);
    const [lastAppointment, nextAppointment] = await Promise.all([
      this.getLastCompletedAppointment(clientId),
      this.getNextAppointment(clientId),
    ]);

    if (client.user) {
      const { password, ...userWithoutPassword } = client.user;
      client.user = userWithoutPassword as any;
    }

    return { ...client, photoUrl, lastAppointment, nextAppointment } as any;
  }

  /**
   * Actualizar perfil de un cliente por su clientId (para el administrador)
   */
  async updateClientByAdmin(
    clientId: number,
    updateClientDto: UpdateClientDto,
    photoFile?: Express.Multer.File,
  ): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
      relations: ['user'],
    });

    if (!client) {
      throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
    }

    if (photoFile) {
      try {
        const photoInfo = await this.fileUploadService.saveFile(
          photoFile,
          this.CLIENT_PHOTO_FOLDER,
          'client',
          client.userId,
        );

        if (client.picture) {
          await this.fileUploadService.deleteFile(
            this.CLIENT_PHOTO_FOLDER,
            client.picture,
          );
        }

        updateClientDto.picture = photoInfo.fileName;
      } catch (error) {
        this.logger.error('Error al guardar la foto del cliente:', error);
        throw new BadRequestException('Error al guardar la foto de perfil');
      }
    }

    // Actualizar username en la entidad User si se proporcionó
    if (updateClientDto.username !== undefined && client.user) {
      await this.userRepository.update(client.user.id, {
        username: updateClientDto.username,
      });
      client.user.username = updateClientDto.username;
    }

    const allowedFields = [
      'name',
      'lastName',
      'email',
      'phone',
      'birthDate',
      'location',
      'isActive',
      'picture',
    ];
    const updates: Partial<Client> = {};

    Object.keys(updateClientDto).forEach((key) => {
      if (!allowedFields.includes(key) || updateClientDto[key] === undefined)
        return;

      let value = updateClientDto[key];
      if (key === 'birthDate' && typeof value === 'string')
        value = new Date(value);
      if (key === 'isActive' && value !== undefined) value = Number(value);

      updates[key] = value;
    });

    Object.assign(client, updates);
    const saved = await this.clientRepository.save(client);

    const photoUrl = saved.picture
      ? this.fileUploadService.getFileUrl(
          this.CLIENT_PHOTO_FOLDER,
          saved.picture,
        )
      : '';

    if (saved.user) {
      const { password, ...userWithoutPassword } = saved.user as any;
      saved.user = userWithoutPassword;
    }

    return { ...saved, photoUrl } as any;
  }

  /**
   * Asigna (o elimina) el alias que una compañía le da a un cliente.
   *
   * El alias es propio de la relación (cliente, compañía): se guarda como un
   * elemento del array JSON `client.companyAliases`, así que cada compañía
   * mantiene su alias sin pisar el de las demás.
   *
   * @param adminId  Usuario admin autenticado (debe ser dueño de la compañía).
   * @param clientId Cliente al que se le asigna el alias.
   * @param dto      { companyId, alias }. Alias vacío => se elimina la entrada.
   */
  async setCompanyAlias(
    adminId: number,
    clientId: number,
    dto: SetCompanyAliasDto,
  ): Promise<Client> {
    // 1. Verificar que el admin sea dueño de la compañía indicada
    const company = await this.companyRepository.findOne({
      where: { id: dto.companyId, userId: adminId },
    });
    if (!company) {
      throw new ForbiddenException(
        'No tienes acceso a la compañía indicada o no existe',
      );
    }

    // 2. Buscar el cliente
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
    });
    if (!client) {
      throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
    }

    // 3. Upsert del alias para esta compañía, sin tocar el de otras
    const aliases = (client.companyAliases ?? []).filter(
      (a) => Number(a.companyId) !== dto.companyId,
    );
    const trimmed = (dto.alias ?? '').trim();
    if (trimmed.length > 0) {
      aliases.push({ companyId: dto.companyId, alias: trimmed });
    }
    client.companyAliases = aliases;

    return this.clientRepository.save(client);
  }

  async getClientPhotoUrl(clientId: number): Promise<string> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
    });
    if (!client) {
      throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
    }
    if (!client.picture) {
      return '';
    }
    return this.fileUploadService.getFileUrl(
      this.CLIENT_PHOTO_FOLDER,
      client.picture,
    );
  }
}
