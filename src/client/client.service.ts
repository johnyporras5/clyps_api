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
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import {
  AllowedFolder,
  FileUploadService,
} from '../common/services/file_upload.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { SetCompanyAliasDto } from './dto/set-company-alias.dto';
import { FindAllClientsDto } from './dto/find-all-clients.dto';
import {
  applyCompanyActivation,
  normalizeCompanyIds,
  resolveIsActiveForCompanies,
  sharedCompanyIds,
} from './client-activation.util';

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

  private normalizeBirthdate(updateClientDto: UpdateClientDto): void {
    if (updateClientDto.birthdate !== undefined) {
      updateClientDto.birthDate = updateClientDto.birthdate;
    }
  }

  /**
   * Compañías del usuario autenticado, según su rol:
   *  - `adm`: las compañías que POSEE (company.user_id).
   *  - `wrk`: aquellas donde tiene membresía ACTIVA (company_worker.is_active).
   *
   * Es la misma resolución que usa el listado de clientes, extraída para poder
   * reutilizarla en las validaciones de acceso a un cliente concreto.
   */
  private async resolveCallerCompanyIds(
    userId: number,
    userRole?: string,
  ): Promise<number[]> {
    if (userRole === 'wrk') {
      const memberships = await this.companyWorkerRepository.find({
        where: { userId, isActive: 1 },
        select: ['companyId'],
      });
      return [...new Set(memberships.map((cw) => cw.companyId))];
    }

    const companies = await this.companyRepository.find({
      where: { userId },
      select: ['id'],
    });
    return companies.map((c) => c.id);
  }

  /**
   * Garantiza que el usuario autenticado puede ver/editar este cliente, y lo
   * devuelve. El criterio es el MISMO que el del listado de clientes: se puede
   * acceder si el cliente lo creó él, o si pertenece a alguna de sus compañías.
   *
   * Aplica igual a admin y a trabajador: antes no había ninguna comprobación y
   * un admin podía editar clientes de otras empresas con solo saber su ID.
   */
  private async assertCanAccessClient(
    clientId: number,
    userId: number,
    userRole?: string,
  ): Promise<Client> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
    });
    if (!client) {
      throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
    }

    // Lo creó el propio usuario autenticado.
    if (client.userId === userId) {
      return client;
    }

    // O comparte compañía con él.
    const callerCompanyIds = await this.resolveCallerCompanyIds(
      userId,
      userRole,
    );
    const clientCompanyIds = (client.companies ?? []).map((id) => Number(id));
    const shares = clientCompanyIds.some((id) => callerCompanyIds.includes(id));

    if (!shares) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a este cliente: no pertenece a tu compañía',
      );
    }

    return client;
  }

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
    details: { serviceName: string | null; workerName: string | null }[];
  }> {
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId: session.id },
    });

    let companyName: string | null = null;
    let offerName: string | null = null;
    const services: string[] = [];
    // Un elemento por cada detalle de la sesión (mismo orden que `services`):
    // servicio + trabajador que lo atendió (workerName null si no hay asignado).
    const details: { serviceName: string | null; workerName: string | null }[] =
      [];

    if (sessionDetails.length > 0) {
      const serviceIds = [
        ...new Set(sessionDetails.map((d) => d.serviceId).filter(Boolean)),
      ];
      const companyWorkerIds = [
        ...new Set(
          sessionDetails.map((d) => d.companyWorkerId).filter(Boolean),
        ),
      ];
      const offerIds = [
        ...new Set(sessionDetails.map((d) => d.offerId).filter(Boolean)),
      ];

      const serviceMap = new Map<number, string | null>();
      if (serviceIds.length > 0) {
        const serviceRows = await this.serviceRepository.find({
          where: { id: In(serviceIds) },
          select: ['id', 'name'],
        });
        for (const s of serviceRows) serviceMap.set(s.id, s.name ?? null);
      }

      // Trabajadores por companyWorkerId (worker y company son eager). Se usa
      // tanto para workerName de cada detalle como para resolver companyName.
      const workerNameMap = new Map<number, string | null>();
      let companyWorkers: CompanyWorker[] = [];
      if (companyWorkerIds.length > 0) {
        companyWorkers = await this.companyWorkerRepository.find({
          where: { id: In(companyWorkerIds) },
        });
        for (const cw of companyWorkers) {
          const wn = cw.worker?.name?.trim();
          workerNameMap.set(cw.id, wn ? wn : null);
        }
      }

      for (const d of sessionDetails) {
        const serviceName = serviceMap.get(d.serviceId) ?? null;
        if (serviceName) services.push(serviceName);
        details.push({
          serviceName,
          workerName: d.companyWorkerId
            ? (workerNameMap.get(d.companyWorkerId) ?? null)
            : null,
        });
      }

      if (offerIds.length > 0) {
        const offer = await this.offerRepository.findOne({
          where: { id: In(offerIds) },
          relations: ['company'],
        });
        offerName = offer?.name ?? null;
        companyName = offer?.company?.name ?? null;
      }

      if (!companyName && companyWorkers.length > 0) {
        companyName = companyWorkers[0].company?.name ?? null;
      }
    }

    return {
      sessionId: session.id,
      sessionDatetime: session.sessionDatetime,
      sessionStatus: session.sessionStatus,
      companyName,
      services,
      offerName,
      details,
    };
  }

  /**
   * Última cita completada (sessionStatus 3 = Completada, 4 = Pagada) del cliente.
   */
  private async getLastCompletedAppointment(clientId: number) {
    const session = await this.sessionRepository.findOne({
      where: { clientId, sessionStatus: In([3, 4, 6]) },
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
    options: FindAllClientsDto,
    userRole?: string,
  ): Promise<PaginationResult<any>> {
    this.logger.log(
      `=== SERVICE: LISTANDO CLIENTES PARA USER ID: ${adminId} (rol: ${userRole ?? 'adm'}) ===`,
    );

    await this.validateUserExists(adminId);

    let adminCompanies: Company[] = [];

    if (userRole === 'wrk') {
      const memberships = await this.companyWorkerRepository.find({
        where: { userId: adminId, isActive: 1 },
      });
      const workerCompanyIds = [
        ...new Set(memberships.map((cw) => cw.companyId)),
      ];
      if (workerCompanyIds.length > 0) {
        adminCompanies = await this.companyRepository.find({
          where: { id: In(workerCompanyIds) },
        });
      }
    } else {
      adminCompanies = await this.companyRepository.find({
        where: { userId: adminId },
      });
    }

    const adminCompanyIds = adminCompanies.map((company) => company.id);
    this.logger.log(
      `[DEBUG] IDs de compañías del usuario ${adminId}: ${adminCompanyIds}`,
    );

    // 2. Construir query (incluye clientes activos e inactivos)
    const queryBuilder = this.clientRepository
      .createQueryBuilder('client')
      .leftJoinAndSelect('client.user', 'user');

    // 3. Aplicar condiciones de visibilidad (SIN isPublic)
    if (adminCompanyIds.length === 0) {
      // Admin SIN compañías: Solo puede ver clientes que él mismo creó
      queryBuilder.where('client.userId = :adminId', { adminId });
    } else {
      // Admin CON compañías: Puede ver:
      // a) Clientes que él creó
      // b) Clientes que comparten compañías con el admin
      queryBuilder.where(
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

    // 3.b Filtro por nombre: name, last_name, concat o alias por compañía.
    // El alias se guarda en company_aliases (JSON: [{ companyId, alias }]);
    // se extraen los alias con JSON_EXTRACT y se compara con LOWER en ambos
    // lados para que la búsqueda sea case-insensitive igual que el nombre
    // (JSON_SEARCH usa collation binaria y distinguía mayúsculas/minúsculas).
    if (options.name && options.name.trim() !== '') {
      const searchTerm = `%${options.name.trim()}%`;
      queryBuilder.andWhere(
        "(client.name LIKE :search OR client.last_name LIKE :search OR CONCAT(client.name, ' ', client.last_name) LIKE :search OR LOWER(JSON_EXTRACT(client.company_aliases, '$[*].alias')) LIKE LOWER(:search))",
        { search: searchTerm },
      );
    }

    if (options.isActive !== undefined) {
      const wantsActive = parseInt(options.isActive, 10) === 1;

      if (adminCompanyIds.length === 0) {
        queryBuilder.andWhere('client.is_active = :isActiveFlag', {
          isActiveFlag: wantsActive ? 1 : 0,
        });
      } else {
        // COALESCE porque ambas columnas son JSON nullable y JSON_CONTAINS
        // devuelve NULL (no false) cuando el documento es NULL.
        const sharesAny = adminCompanyIds
          .map(
            (_, i) =>
              `JSON_CONTAINS(COALESCE(client.companies, JSON_ARRAY()), :actCid${i})`,
          )
          .join(' OR ');
        const activeInShared = adminCompanyIds
          .map(
            (_, i) =>
              `(JSON_CONTAINS(COALESCE(client.companies, JSON_ARRAY()), :actCid${i}) AND NOT JSON_CONTAINS(COALESCE(client.inactive_companies, JSON_ARRAY()), :actCid${i}))`,
          )
          .join(' OR ');

        const effectiveActive = `client.is_active = 1 AND (NOT (${sharesAny}) OR (${activeInShared}))`;
        queryBuilder.andWhere(
          wantsActive ? `(${effectiveActive})` : `NOT (${effectiveActive})`,
        );

        adminCompanyIds.forEach((companyId, i) => {
          queryBuilder.setParameter(`actCid${i}`, JSON.stringify(companyId));
        });
      }
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
      .andWhere('s.session_status IN (:...attendedStatuses)', {
        attendedStatuses: [3, 4, 6],
      })
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
        // El estado va POR COMPAÑÍA: se resuelve contra las compañías que este
        // admin/worker comparte con el cliente, no contra la bandera global.
        // Así, si otro salón lo desactivó, aquí sigue saliendo activo.
        isActive: resolveIsActiveForCompanies(
          client,
          sharedCompanies.map((c) => c.id),
        ),
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
    this.normalizeBirthdate(updateClientDto);

    // `isActive` NO está permitido aquí: el estado lo maneja el salón, no el
    // propio cliente (si no, podría reactivarse solo mandando isActive=1).
    const allowedFields = [
      'name',
      'lastName',
      'email',
      'phone',
      'birthDate',
      'location',
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
      const { password: _, ...userWithoutPassword } = client.user;
      client.user = userWithoutPassword as any;
    }

    // `companies` alimenta "mis salones" en el home del cliente. Se ocultan los
    // salones que lo desactivaron: para él, ese negocio deja de existir.
    const inactiveForClient = normalizeCompanyIds(client.inactiveCompanies);
    const visibleCompanies = normalizeCompanyIds(client.companies).filter(
      (id) => !inactiveForClient.includes(id),
    );

    return {
      ...client,
      companies: visibleCompanies,
      // La entidad guarda la propiedad como `birthDate`, pero el contrato
      // público del API es `birthdate` (igual que en el alta y que en worker).
      // Se expone en minúscula y se mantiene `birthDate` por compatibilidad.
      birthdate: client.birthDate ?? null,
      preferences: client.preferences ?? [],
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
    callerId?: number,
    callerRole?: string,
  ): Promise<Client & { photoUrl: string }> {
    // Si viene el usuario autenticado, se valida que el cliente sea suyo o de
    // su compañía (aplica a admin y a trabajador).
    if (callerId) {
      await this.assertCanAccessClient(clientId, callerId, callerRole);
    }

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
      const { password: _, ...userWithoutPassword } = client.user;
      client.user = userWithoutPassword as any;
    }

    return {
      ...client,
      // Estado POR COMPAÑÍA: es el que alimenta el toggle "Activo" de la
      // pantalla de edición, así que debe reflejar solo a este salón.
      isActive: resolveIsActiveForCompanies(
        client,
        callerId
          ? sharedCompanyIds(
              client,
              await this.resolveCallerCompanyIds(callerId, callerRole),
            )
          : [],
      ),
      // La entidad guarda la propiedad como `birthDate`, pero el contrato
      // público del API es `birthdate` (igual que en el alta y que en worker).
      // Se expone en minúscula y se mantiene `birthDate` por compatibilidad.
      birthdate: client.birthDate ?? null,
      preferences: client.preferences ?? [],
      photoUrl,
      lastAppointment,
      nextAppointment,
    } as any;
  }

  /**
   * Actualizar perfil de un cliente por su clientId (para el administrador)
   */
  async updateClientByAdmin(
    clientId: number,
    updateClientDto: UpdateClientDto,
    photoFile?: Express.Multer.File,
    callerId?: number,
    callerRole?: string,
    callerCompanyId?: number | null,
  ): Promise<Client> {
    // El cliente debe ser del usuario autenticado o de su compañía. Aplica a
    // admin y trabajador; antes no se validaba nada y se podía editar cualquier
    // cliente conociendo su ID.
    if (callerId) {
      await this.assertCanAccessClient(clientId, callerId, callerRole);
    }

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

    this.normalizeBirthdate(updateClientDto);

    // `isActive` no entra por aquí: se aplica por compañía más abajo.
    const allowedFields = [
      'name',
      'lastName',
      'email',
      'phone',
      'birthDate',
      'location',
      'picture',
    ];
    const updates: Partial<Client> = {};

    Object.keys(updateClientDto).forEach((key) => {
      if (!allowedFields.includes(key) || updateClientDto[key] === undefined)
        return;

      let value = updateClientDto[key];
      if (key === 'birthDate' && typeof value === 'string')
        value = new Date(value);

      updates[key] = value;
    });

    Object.assign(client, updates);

    const targetCompanyIds = callerId
      ? await this.resolveActivationTargets(
          client,
          callerId,
          callerRole,
          callerCompanyId,
        )
      : [];

    if (updateClientDto.isActive !== undefined) {
      const shouldBeActive = Number(updateClientDto.isActive) === 1;

      if (targetCompanyIds.length > 0) {
        client.inactiveCompanies = applyCompanyActivation(
          client,
          targetCompanyIds,
          shouldBeActive,
        );
      } else {
        client.isActive = shouldBeActive ? 1 : 0;
      }
    }

    const saved = await this.clientRepository.save(client);

    const photoUrl = saved.picture
      ? this.fileUploadService.getFileUrl(
          this.CLIENT_PHOTO_FOLDER,
          saved.picture,
        )
      : '';

    if (saved.user) {
      const { password: _, ...userWithoutPassword } = saved.user as any;
      saved.user = userWithoutPassword;
    }

    // Se devuelve el estado tal como lo ve ESTE salón, que es lo que el front
    // vuelve a pintar en el toggle después de guardar.
    return {
      ...saved,
      isActive: resolveIsActiveForCompanies(saved, targetCompanyIds),
      photoUrl,
    } as any;
  }

  /**
   * Compañías a las que aplica el toggle "Activo" de un admin/worker: las que
   * comparte con el cliente. Si el token trae la compañía activa y es una de
   * ellas se usa solo esa (caso normal, un salón); si no, se aplican todas las
   * compartidas. Vacío = el cliente no está en ningún salón del que edita, así
   * que el estado se guarda en la bandera global.
   */
  private async resolveActivationTargets(
    client: Client,
    callerId: number,
    callerRole?: string,
    callerCompanyId?: number | null,
  ): Promise<number[]> {
    const shared = sharedCompanyIds(
      client,
      await this.resolveCallerCompanyIds(callerId, callerRole),
    );

    if (callerCompanyId && shared.includes(Number(callerCompanyId))) {
      return [Number(callerCompanyId)];
    }

    return shared;
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
