import { Injectable, NotFoundException, BadRequestException, Logger, } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, Between } from 'typeorm';
import { Session } from './entities/session.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { CreateSessionWithDetailDto } from './dto/create-session-with-detail.dto';
import { Client } from '../client/entities/client.entity';
import { Company } from '../company/entities/company.entity';
import { User } from '../user/entities/user.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { Service } from '../service/entities/service.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { EmailService } from '../email/email.service';
import { Worker } from '../worker/entities/worker.entity';
import { PaginationResult } from '../common/dto/pagination.dto';
import { UpdateSessionDto } from './dto/update-session-and-detail.dto';
import { GetSessionsDto } from './dto/get-sessions.dto';
import { SessionResponse } from './types/session-response.type';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @InjectRepository(SessionDetail)
    private sessionDetailRepository: Repository<SessionDetail>,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    private emailService: EmailService,
  ) { }

  // Método simplificado - ya no verifica si es administrador
  async create(createSessionDto: CreateSessionDto, adminId: number): Promise<Session> {
    // Verificar si ya existe una sesión con los mismos datos
    const existingSession = await this.checkExistingSession(createSessionDto);

    if (existingSession) {
      throw new BadRequestException({
        message: 'Ya existe una sesión con los mismos datos',
        existingSession: existingSession,
        duplicateData: {
          clientId: createSessionDto.clientId,
          sessionDatetime: createSessionDto.sessionDatetime,
          sessionStatus: createSessionDto.sessionStatus
        }
      });
    }

    // Asignar valores por defecto
    const sessionData = {
      ...createSessionDto,
      sessionStatus: createSessionDto.sessionStatus !== undefined ? createSessionDto.sessionStatus : 1,
      status: createSessionDto.status !== undefined ? createSessionDto.status : 1,
      startDatetime: createSessionDto.startDatetime || createSessionDto.sessionDatetime || new Date(),
    };

    const session = this.sessionRepository.create(sessionData);
    return await this.sessionRepository.save(session);
  }

  /**
  * Calcular porcentajes para trabajador y compañía basados en el servicio
  * REGLAS:
  * 1. El campo `percentage` en Service es el % que se paga AL TRABAJADOR
  * 2. Si hay workers específicos asignados, usar ese porcentaje para el trabajador
  * 3. Si no hay workers específicos, usar el `percentage` general del servicio
  * 4. La compañía recibe el resto (100% - porcentaje_trabajador)
  */
  private calculatePercentages(
    service: Service,
    companyWorkerId: number
  ): {
    workerPercentage: number;
    companyPercentage: number;
    workerAssigned: boolean;
  } {
    let workerPercentage = 0;
    let companyPercentage = 0;
    let workerAssigned = false;

    // 1. Verificar si el trabajador está asignado específicamente a este servicio
    if (service.workers && Array.isArray(service.workers) && service.workers.length > 0) {
      const workerAssignment = service.workers.find(
        (worker: any) => worker.id === companyWorkerId
      );

      if (workerAssignment) {
        workerPercentage = workerAssignment.percentage;
        workerAssigned = true;
        console.log(`✅ Trabajador asignado específicamente: ${workerPercentage}% para trabajador`);
      }
    }

    // 2. Si el trabajador NO está asignado específicamente, usar el porcentaje general del servicio
    if (!workerAssigned) {
      if (service.percentage !== undefined && service.percentage !== null) {
        workerPercentage = Number(service.percentage);
        console.log(`ℹ️ Usando porcentaje general del servicio: ${workerPercentage}% para trabajador`);
      } else {
        // 3. Si no hay workers específicos NI porcentaje general, ERROR
        throw new BadRequestException(
          `El servicio ${service.id} no tiene configurado el porcentaje para el trabajador. ` +
          `Debe tener un porcentaje general o el trabajador debe estar asignado específicamente.`
        );
      }
    }

    // 4. La compañía recibe el resto
    companyPercentage = 100 - workerPercentage;

    console.log(`📊 Resultado: Trabajador ${workerPercentage}%, Compañía ${companyPercentage}%`);

    // Validar que los porcentajes sean válidos
    if (workerPercentage < 0 || workerPercentage > 100) {
      throw new BadRequestException(`El porcentaje del trabajador (${workerPercentage}%) debe estar entre 0 y 100`);
    }

    if (companyPercentage < 0 || companyPercentage > 100) {
      throw new BadRequestException(`El porcentaje de la compañía (${companyPercentage}%) debe estar entre 0 y 100`);
    }

    // Validar que la suma sea 100%
    const total = workerPercentage + companyPercentage;
    if (Math.abs(total - 100) > 0.01) {
      throw new BadRequestException(`La suma de porcentajes (${total}%) debe ser 100%`);
    }

    return { workerPercentage, companyPercentage, workerAssigned };
  }

  /**
 * Calcular montos basados en el costo total
 */
  private calculateAmounts(
    totalCost: number,
    workerPercentage: number,
    companyPercentage: number
  ): {
    cost: number;
    totalWorker: number;
    totalCompany: number;
    calculationDetails: string;
  } {
    // Calcular montos con alta precisión
    const workerAmount = (totalCost * workerPercentage) / 100;
    const companyAmount = (totalCost * companyPercentage) / 100;

    // Redondear a 2 decimales
    const totalWorker = Number(workerAmount.toFixed(2));
    const totalCompany = Number(companyAmount.toFixed(2));

    // Ajustar para asegurar que la suma sea exactamente el totalCost
    const totalCalculated = totalWorker + totalCompany;
    let adjustedTotalWorker = totalWorker;
    let adjustedTotalCompany = totalCompany;

    if (Math.abs(totalCost - totalCalculated) > 0.01) {
      // Ajustar el monto de la compañía para que la suma sea exacta
      adjustedTotalCompany = Number((totalCost - totalWorker).toFixed(2));
      console.log(`⚖️ Ajustando montos: Trabajador=${totalWorker}, Compañía=${adjustedTotalCompany} (ajustado)`);
    }

    const calculationDetails = `Cálculo: ${totalCost} × (${workerPercentage}% trabajador + ${companyPercentage}% compañía) = ${adjustedTotalWorker} + ${adjustedTotalCompany}`;

    return {
      cost: totalCost,
      totalWorker: adjustedTotalWorker,
      totalCompany: adjustedTotalCompany,
      calculationDetails
    };
  }

  /**
   * Verificar si ya existe un SessionDetail con los mismos datos
   */
  private async checkExistingSessionDetail(
    sessionId: number,
    serviceId: number,
    companyWorkerId: number
  ): Promise<SessionDetail | null> {
    const existingDetail = await this.sessionDetailRepository.findOne({
      where: {
        sessionId: sessionId,
        serviceId: serviceId,
        companyWorkerId: companyWorkerId
      }
    });

    return existingDetail;
  }

  /**
 * Crear sesión y session_detail juntos (CON VALORES POR DEFECTO)
 * NO CREA NADA si ya existe una sesión con los mismos datos
 */
  async createSessionWithDetail(
    createSessionWithDetailDto: CreateSessionWithDetailDto,
    adminId: number
  ): Promise<{
    message: string;
    isNew: boolean;
    wasAlreadyAssociated: boolean;
    clientId: number;
    companyId: number | null;
    companiesBefore: number[];
    companiesAfter: number[];
    calculations?: {
      totalCost: number;
      totalTime: number;
      workerPercentage: number;
      companyPercentage: number;
      totalWorker: number;
      totalCompany: number;
      calculationDetails: string;
      workerAssigned: boolean;
    };
    existingSession?: Session;
    existingDetail?: SessionDetail;
  }> {
    // 1. Verificar que la sesión tiene un cliente
    if (!createSessionWithDetailDto.clientId) {
      throw new BadRequestException('La sesión debe tener un cliente asociado');
    }

    // 2. Verificar que el administrador tiene una compañía
    const adminCompany = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!adminCompany) {
      throw new NotFoundException('El administrador no tiene una compañía asignada');
    }

    const companyId = adminCompany.id;
    const companyName = adminCompany.name;

    // 3. Verificar que el servicio existe y pertenece a la compañía del admin
    const service = await this.serviceRepository.findOne({
      where: {
        id: createSessionWithDetailDto.serviceId,
        companyId: adminCompany.id
      }
    });

    if (!service) {
      throw new NotFoundException(`Servicio con ID ${createSessionWithDetailDto.serviceId} no encontrado o no pertenece a tu compañía`);
    }

    // Validar que el servicio tenga configuración de porcentajes
    this.validateServicePercentages(service);

    // 4. Verificar que el companyWorker existe y pertenece a la compañía del admin
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: {
        id: createSessionWithDetailDto.companyWorkerId,
        companyId: adminCompany.id
      }
    });

    if (!companyWorker) {
      throw new NotFoundException(`Trabajador de compañía con ID ${createSessionWithDetailDto.companyWorkerId} no encontrado o no pertenece a tu compañía`);
    }

    // 5. Verificar que el trabajador esté activo
    if (companyWorker.isActive !== 1) {
      throw new BadRequestException(`El trabajador de compañía con ID ${createSessionWithDetailDto.companyWorkerId} no está activo`);
    }

    // 6. Verificar si ya existe una sesión con los mismos datos
    const sessionData: CreateSessionDto = {
      clientId: createSessionWithDetailDto.clientId,
      sessionDatetime: createSessionWithDetailDto.sessionDatetime,
      sessionStatus: createSessionWithDetailDto.sessionStatus !== undefined ? createSessionWithDetailDto.sessionStatus : 1,
      // TOMAR VALORES DEL SERVICIO, NO DEL DTO
      totalCost: service.cost || 0,
      totalTime: service.standardTime || 0,
      iaResponse: createSessionWithDetailDto.iaResponse,
      startDatetime: createSessionWithDetailDto.startDatetime || createSessionWithDetailDto.sessionDatetime || new Date(),
      status: createSessionWithDetailDto.status !== undefined ? createSessionWithDetailDto.status : 1,
    };

    const existingSession = await this.checkExistingSession(sessionData);

    // 7. SI YA EXISTE UNA SESIÓN CON LOS MISMOS DATOS
    if (existingSession) {
      console.log(`🚫 SESIÓN DUPLICADA: Ya existe una sesión ID: ${existingSession.id} con los mismos datos`);

      // Verificar si ya existe un detalle con el mismo servicio y trabajador para esta sesión
      const existingDetail = await this.checkExistingSessionDetail(
        existingSession.id,
        createSessionWithDetailDto.serviceId,
        createSessionWithDetailDto.companyWorkerId
      );

      if (existingDetail) {
        console.log(`🚫 DETALLE DUPLICADO: Ya existe un detalle ID: ${existingDetail.id} para esta sesión`);

        // Obtener información del trabajador para el mensaje
        const workerInfo = companyWorker.worker ?
          `${companyWorker.worker.name} ${companyWorker.worker.lastName}` :
          `Trabajador ID: ${companyWorker.id}`;

        throw new BadRequestException({
          message: `El cliente ya tiene una sesión con los mismos datos y el mismo detalle (servicio ${createSessionWithDetailDto.serviceId}, trabajador ${workerInfo}). No se creó nada nuevo.`,
          existingSession,
          existingDetail,
          recommendation: 'Si desea modificar la sesión existente, use el endpoint de actualización.'
        });
      }

      // Si existe la sesión pero NO existe el detalle, tampoco creamos nada nuevo
      console.log(`ℹ️ Sesión existente ID: ${existingSession.id}, pero no se creará un nuevo detalle para evitar duplicados`);

      const workerInfo = companyWorker.worker ?
        `${companyWorker.worker.name} ${companyWorker.worker.lastName}` :
        `Trabajador ID: ${companyWorker.id}`;

      return {
        message: `El cliente ya tiene una sesión con los mismos datos (ID: ${existingSession.id}). Para agregar un nuevo servicio o trabajador, debe crear una nueva sesión con datos diferentes.`,
        isNew: false,
        wasAlreadyAssociated: false,
        clientId: createSessionWithDetailDto.clientId,
        companyId: companyId,
        companiesBefore: [],
        companiesAfter: [],
        existingSession: existingSession
      };
    }

    // 8. SI NO EXISTE SESIÓN DUPLICADA, PROCEDER CON LA CREACIÓN
    // CALCULAR PORCENTAJES
    const { workerPercentage, companyPercentage, workerAssigned } = this.calculatePercentages(
      service,
      createSessionWithDetailDto.companyWorkerId
    );

    // TOMAR EL COSTO TOTAL DEL SERVICIO, NO DEL DTO
    let totalCost = service.cost || 0;

    // Validar que el costo sea mayor que 0
    if (totalCost <= 0) {
      throw new BadRequestException('El costo del servicio debe ser mayor a 0');
    }

    // CALCULAR MONTOS
    const calculatedAmounts = this.calculateAmounts(totalCost, workerPercentage, companyPercentage);

    console.log(`📊 Cálculos: Costo=${calculatedAmounts.cost}, Trabajador=${calculatedAmounts.totalWorker} (${workerPercentage}%), Compañía=${calculatedAmounts.totalCompany} (${companyPercentage}%)`);

    // 9. Crear la sesión (nueva) con los valores del servicio
    const session = await this.create(sessionData, adminId);
    const isNew = true;
    let wasAlreadyAssociated = false;
    let companiesBefore: number[] = [];
    let companiesAfter: number[] = [];

    // 10. Verificar y actualizar las compañías del cliente
    const client = await this.clientRepository.findOne({
      where: { id: createSessionWithDetailDto.clientId }
    });

    if (!client) {
      throw new NotFoundException(`Cliente con ID ${createSessionWithDetailDto.clientId} no encontrado`);
    }

    // Obtener las compañías actuales del cliente
    companiesBefore = client.companies || [];
    console.log(`📋 Cliente ID: ${client.id}, Compañías antes: ${JSON.stringify(companiesBefore)}`);
    console.log(`🏢 ID de compañía a agregar: ${companyId}`);

    // Verificar si el cliente ya está asociado a esta compañía
    const currentCompanies = companiesBefore;

    // Convertir todos a números para comparación segura
    const companyIds = currentCompanies.map(id => Number(id));
    const targetCompanyId = Number(companyId);

    if (!companyIds.includes(targetCompanyId)) {
      console.log(`✅ ${targetCompanyId} NO está en el array. Agregando...`);

      // Agregar la compañía al array de compañías del cliente
      const updatedCompanies = [...currentCompanies, targetCompanyId];
      companiesAfter = updatedCompanies;

      await this.clientRepository.update(client.id, {
        companies: updatedCompanies
      });

      wasAlreadyAssociated = false;
      console.log(`✅ Cliente ID: ${client.id} asociado a compañía ID: ${targetCompanyId}`);
      console.log(`📋 Compañías después: ${JSON.stringify(updatedCompanies)}`);
    } else {
      console.log(`⚠️ ${targetCompanyId} YA está en el array. No se agrega.`);
      companiesAfter = currentCompanies;
      wasAlreadyAssociated = true;
    }

    // 11. Crear el SessionDetail con los valores calculados
    const sessionDetailData = {
      cost: calculatedAmounts.cost,
      serviceId: createSessionWithDetailDto.serviceId,
      companyWorkerId: createSessionWithDetailDto.companyWorkerId,
      sessionId: session.id,
      // startDatetime por defecto usa el de la sesión
      startDatetime: createSessionWithDetailDto.detailStartDatetime || session.startDatetime,
      // TOMAR EL TIEMPO DEL SERVICIO, NO DEL DTO
      totalTime: service.standardTime || 0,
      totalWorker: calculatedAmounts.totalWorker,
      totalCompany: calculatedAmounts.totalCompany,
      // status por defecto es 1
      status: createSessionWithDetailDto.detailStatus !== undefined ? createSessionWithDetailDto.detailStatus : 1,
    };

    console.log(`📝 Creando SessionDetail:`, JSON.stringify(sessionDetailData, null, 2));

    const sessionDetail = this.sessionDetailRepository.create(sessionDetailData);
    const savedSessionDetail = await this.sessionDetailRepository.save(sessionDetail);

    // 12. Enviar correos de confirmación (después de crear todo exitosamente)
    await this.sendConfirmationEmails(
      session,
      savedSessionDetail,
      createSessionWithDetailDto.clientId,
      createSessionWithDetailDto.companyWorkerId,
      createSessionWithDetailDto.serviceId,
      companyId
    );

    // 13. Construir mensaje
    let message: string;

    if (wasAlreadyAssociated) {
      message = `Sesión y detalle creados exitosamente. El cliente YA estaba asociado a ${companyName}.`;
    } else {
      message = `Sesión y detalle creados exitosamente.`;
    }

    // 13. Obtener información del trabajador para el mensaje
    const workerInfo = companyWorker.worker ?
      `${companyWorker.worker.name} ${companyWorker.worker.lastName}` :
      `Trabajador ID: ${companyWorker.id}`;

    return {
      message: `${message} Trabajador asignado: ${workerInfo}. `,
      isNew,
      wasAlreadyAssociated,
      clientId: createSessionWithDetailDto.clientId,
      companyId,
      companiesBefore,
      companiesAfter,
      calculations: {
        totalCost: calculatedAmounts.cost,
        totalTime: service.standardTime || 0,
        workerPercentage,
        companyPercentage,
        totalWorker: calculatedAmounts.totalWorker,
        totalCompany: calculatedAmounts.totalCompany,
        calculationDetails: calculatedAmounts.calculationDetails,
        workerAssigned
      }
    };
  }

  /**
   * Verificar si ya existe una sesión con los mismos datos
   */
  private async checkExistingSession(createSessionDto: CreateSessionDto): Promise<Session | null> {
    if (!createSessionDto.clientId) {
      return null;
    }

    const whereConditions: any = {
      clientId: createSessionDto.clientId
    };

    // Agregar condiciones solo si los valores están definidos
    if (createSessionDto.sessionDatetime) {
      whereConditions.sessionDatetime = createSessionDto.sessionDatetime;
    }

    if (createSessionDto.sessionStatus !== undefined) {
      whereConditions.sessionStatus = createSessionDto.sessionStatus;
    }

    if (createSessionDto.totalCost !== undefined) {
      whereConditions.totalCost = createSessionDto.totalCost;
    }

    if (createSessionDto.totalTime !== undefined) {
      whereConditions.totalTime = createSessionDto.totalTime;
    }

    if (createSessionDto.startDatetime) {
      whereConditions.startDatetime = createSessionDto.startDatetime;
    }

    if (createSessionDto.status !== undefined) {
      whereConditions.status = createSessionDto.status;
    }

    // Buscar sesión existente
    const existingSession = await this.sessionRepository.findOne({
      where: whereConditions
    });

    return existingSession;
  }



  /**
   * Buscar sesiones por cliente y fecha (para verificar duplicados)
   */
  async findSessionsByClientAndDate(
    clientId: number,
    sessionDatetime: Date
  ): Promise<Session[]> {
    const startOfDay = new Date(sessionDatetime);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(sessionDatetime);
    endOfDay.setHours(23, 59, 59, 999);

    return await this.sessionRepository.find({
      where: {
        clientId: clientId,
        sessionDatetime: Between(startOfDay, endOfDay)
      },
      order: {
        sessionDatetime: 'ASC'
      }
    });
  }

  async findAll(): Promise<Session[]> {
    return await this.sessionRepository.find();
  }

  async findOne(id: number): Promise<Session> {
    const session = await this.sessionRepository.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }
    return session;
  }

  async findOneWithDetails(id: number): Promise<SessionResponse> {
    // Buscar la sesión por ID
    const session = await this.sessionRepository.findOne({
      where: { id }
    });

    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }

    // Obtener información del cliente
    const client = await this.clientRepository.findOne({
      where: { id: session.clientId }
    });

    if (!client) {
      throw new NotFoundException(`Client with id ${session.clientId} not found`);
    }

    // Obtener detalles de la sesión
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId: session.id }
    });

    // Variables para almacenar información adicional - INICIALIZADAS CON VALORES POR DEFECTO
    let companyId = 0; // VALOR POR DEFECTO
    let companyName = 'Compañía no encontrada'; // VALOR POR DEFECTO
    let workerName = '';
    let workerLastName = '';
    let serviceName = '';
    let serviceDescription = '';


    // Si hay detalles de sesión, obtener información adicional
    if (sessionDetails.length > 0) {
      const firstDetail = sessionDetails[0];

      // Obtener el companyWorker con sus relaciones
      const companyWorker = await this.companyWorkerRepository.findOne({
        where: { id: firstDetail.companyWorkerId },
        relations: ['worker', 'company']
      });

      // Obtener el servicio
      const service = await this.serviceRepository.findOne({
        where: { id: firstDetail.serviceId }
      });

      if (companyWorker) {
        if (companyWorker.company) {
          companyId = companyWorker.company.id;
          companyName = companyWorker.company.name;
        }

        if (companyWorker.worker) {
          workerName = companyWorker.worker.name || '';
          workerLastName = companyWorker.worker.lastName || '';
        }
      }

      if (service) {
        serviceName = service.name || '';
        serviceDescription = service.description || '';

      }
    }

    // Si no se encontró información de compañía en los detalles, buscar la compañía del administrador
    // Solo intentar buscar si aún tenemos el valor por defecto
    if (companyName === 'Compañía no encontrada') {
      // Buscar alguna compañía asociada al cliente
      if (client.companies && client.companies.length > 0) {
        const firstCompanyId = client.companies[0];
        const company = await this.companyRepository.findOne({
          where: { id: firstCompanyId }
        });

        if (company) {
          companyId = company.id;
          companyName = company.name;
        }
      }
    }

    // Formatear el totalCost si es necesario (convertir Decimal a número)
    let totalCost: number;

    // Acceder a la propiedad de forma segura
    const sessionTotalCost = (session as any).totalCost;

    if (typeof sessionTotalCost === 'string') {
      totalCost = parseFloat(sessionTotalCost);
    } else if (sessionTotalCost && typeof sessionTotalCost === 'object') {
      // Si es un objeto Decimal de TypeORM o similar
      try {
        totalCost = parseFloat(String(sessionTotalCost));
      } catch {
        totalCost = 0;
      }
    } else if (typeof sessionTotalCost === 'number') {
      totalCost = sessionTotalCost;
    } else {
      totalCost = 0;
    }

    // Construir la respuesta
    const response: SessionResponse = {
      id: session.id,
      clientId: session.clientId,
      clientName: client.name || '',
      clientLastName: client.lastName || '',
      companyId: companyId,
      companyName: companyName,
      sessionDatetime: session.sessionDatetime,
      sessionStatus: session.sessionStatus,
      sessionStatusText: this.getSessionStatusText(session.sessionStatus),
      totalCost: totalCost,
      totalTime: session.totalTime || 0,
      startDatetime: session.startDatetime || session.sessionDatetime,
      status: session.status || 1,
      iaResponse: session.iaResponse,
      workerName: workerName,
      workerLastName: workerLastName,
      serviceName: serviceName,
      serviceDescription: serviceDescription,
      createdAt: (session as any).createdAt || null,
      updatedAt: (session as any).updatedAt || null
    };

    return response;
  }


async updateSessionWithDetail(
  sessionId: number,
  updateSessionDto: UpdateSessionDto,
  adminId: number
): Promise<{
  session: Session;
  sessionDetail: SessionDetail;
  calculations?: any;
  message: string;
}> {
  console.log(`🔄 Actualizando sesión ${sessionId} y detalle existente`);

  // 1. Verificar que el administrador tiene una compañía
  const adminCompany = await this.companyRepository.findOne({
    where: { userId: adminId }
  });

  if (!adminCompany) {
    throw new NotFoundException('El administrador no tiene una compañía asignada');
  }

  // 2. Buscar la sesión EXISTENTE
  const session = await this.sessionRepository.findOne({
    where: { id: sessionId }
  });

  if (!session) {
    throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
  }

  console.log(`✅ Sesión encontrada para MODIFICAR: ${session.id}`);

  // 3. Buscar el detalle EXISTENTE
  console.log(`🔍 Buscando detalle ID: ${updateSessionDto.detailId} para MODIFICAR`);
  
  const detailToUpdate = await this.sessionDetailRepository.findOne({
    where: {
      id: updateSessionDto.detailId,
      sessionId: sessionId
    }
  });

  if (!detailToUpdate) {
    throw new NotFoundException(
      `Detalle con ID ${updateSessionDto.detailId} no encontrado para la sesión ${sessionId}`
    );
  }

  console.log(`✅ Detalle encontrado para MODIFICAR: ID ${detailToUpdate.id}`);

  // 4. Variables para almacenar los cambios
  const sessionUpdateData: Partial<Session> = {};
  const detailUpdateData: Partial<SessionDetail> = {};

  // 5. Actualizar campos de la sesión
  if (updateSessionDto.clientId !== undefined && updateSessionDto.clientId !== session.clientId) {
    sessionUpdateData.clientId = updateSessionDto.clientId;
    console.log(`📝 Cambiando cliente de ${session.clientId} a ${updateSessionDto.clientId}`);
  }

  if (updateSessionDto.sessionDatetime !== undefined) {
    const newDatetime = new Date(updateSessionDto.sessionDatetime);
    sessionUpdateData.sessionDatetime = newDatetime;
    sessionUpdateData.startDatetime = newDatetime;
    detailUpdateData.startDatetime = newDatetime;
    console.log(`📝 Cambiando fecha de sesión a ${newDatetime}`);
  }

  if (updateSessionDto.sessionStatus !== undefined) {
    sessionUpdateData.sessionStatus = updateSessionDto.sessionStatus;
  }

  // 6. Variables para recálculos SI SE CAMBIA SERVICIO O TRABAJADOR
  let recalculations: any = null;
  
  if (updateSessionDto.serviceId !== undefined || updateSessionDto.companyWorkerId !== undefined) {
    const serviceId = updateSessionDto.serviceId !== undefined 
      ? updateSessionDto.serviceId 
      : detailToUpdate.serviceId;
      
    const companyWorkerId = updateSessionDto.companyWorkerId !== undefined 
      ? updateSessionDto.companyWorkerId 
      : detailToUpdate.companyWorkerId;

    console.log(`📊 Recalculando con servicio: ${serviceId}, trabajador: ${companyWorkerId}`);

    const service = await this.serviceRepository.findOne({
      where: { id: serviceId, companyId: adminCompany.id }
    });

    if (!service) {
      throw new NotFoundException(`Servicio con ID ${serviceId} no encontrado`);
    }

    const companyWorker = await this.companyWorkerRepository.findOne({
      where: { id: companyWorkerId, companyId: adminCompany.id }
    });

    if (!companyWorker) {
      throw new NotFoundException(`Trabajador con ID ${companyWorkerId} no encontrado`);
    }

    if (companyWorker.isActive !== 1) {
      throw new BadRequestException(`El trabajador con ID ${companyWorkerId} no está activo`);
    }

    const { workerPercentage, companyPercentage, workerAssigned } = this.calculatePercentages(
      service,
      companyWorkerId
    );

    const totalCost = service.cost || 0;
    if (totalCost <= 0) {
      throw new BadRequestException('El costo del servicio debe ser mayor a 0');
    }

    const calculatedAmounts = this.calculateAmounts(totalCost, workerPercentage, companyPercentage);

    console.log(`💰 Nuevos cálculos: Costo=${totalCost}, Trabajador=${calculatedAmounts.totalWorker}, Compañía=${calculatedAmounts.totalCompany}`);

    if (updateSessionDto.serviceId !== undefined) {
      detailUpdateData.serviceId = service.id;
    }
    if (updateSessionDto.companyWorkerId !== undefined) {
      detailUpdateData.companyWorkerId = companyWorker.id;
    }
    detailUpdateData.cost = totalCost;
    detailUpdateData.totalWorker = calculatedAmounts.totalWorker;
    detailUpdateData.totalCompany = calculatedAmounts.totalCompany;
    detailUpdateData.totalTime = service.standardTime || 0;

    sessionUpdateData.totalCost = totalCost;
    sessionUpdateData.totalTime = service.standardTime || 0;

    recalculations = {
      totalCost,
      totalTime: service.standardTime || 0,
      workerPercentage,
      companyPercentage,
      totalWorker: calculatedAmounts.totalWorker,
      totalCompany: calculatedAmounts.totalCompany,
      calculationDetails: calculatedAmounts.calculationDetails,
      workerAssigned
    };
  }

  // 7. Actualizar status del detalle
  if (updateSessionDto.detailStatus !== undefined) {
    detailUpdateData.status = updateSessionDto.detailStatus;
  }

  // 8. TRANSACCIÓN
  const queryRunner = this.sessionRepository.manager.connection.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    console.log(`💾 Iniciando transacción de actualización...`);

    // 9. ACTUALIZAR SESIÓN EXISTENTE
    let updatedSession: Session;
    if (Object.keys(sessionUpdateData).length > 0) {
      console.log(`📝 Actualizando sesión ${sessionId} con:`, sessionUpdateData);
      
      // ACTUALIZAR usando update() - esto NO crea nuevo registro
      await queryRunner.manager.update(
        Session,
        { id: sessionId }, // WHERE
        sessionUpdateData   // SET
      );
      
      // Obtener la sesión actualizada
      const foundSession = await queryRunner.manager.findOne(Session, {
        where: { id: sessionId }
      });
      
      if (!foundSession) {
        throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada después de actualizar`);
      }
      
      updatedSession = foundSession;
      console.log(`✅ Sesión actualizada: ${updatedSession.id}`);
    } else {
      updatedSession = session;
      console.log(`ℹ️ No hay cambios en la sesión`);
    }

    // 10. ACTUALIZAR DETALLE EXISTENTE
    let updatedSessionDetail: SessionDetail;
    if (Object.keys(detailUpdateData).length > 0) {
      console.log(`📝 Actualizando detalle ${detailToUpdate.id} con:`, detailUpdateData);
      
      // ACTUALIZAR usando update() - esto NO crea nuevo registro
      await queryRunner.manager.update(
        SessionDetail,
        { 
          id: detailToUpdate.id,
          sessionId: sessionId 
        }, // WHERE
        detailUpdateData   // SET
      );
      
      // Obtener el detalle actualizado
      const foundDetail = await queryRunner.manager.findOne(SessionDetail, {
        where: { id: detailToUpdate.id }
      });
      
      if (!foundDetail) {
        throw new NotFoundException(`Detalle con ID ${detailToUpdate.id} no encontrado después de actualizar`);
      }
      
      updatedSessionDetail = foundDetail;
      console.log(`✅ Detalle actualizado: ${updatedSessionDetail.id}`);
    } else {
      updatedSessionDetail = detailToUpdate;
      console.log(`ℹ️ No hay cambios en el detalle`);
    }

    // 11. VERIFICACIÓN - Contar registros
    const sessionCount = await queryRunner.manager.count(Session, {
      where: { clientId: updatedSession.clientId }
    });
    
    const detailCount = await queryRunner.manager.count(SessionDetail, {
      where: { sessionId: sessionId }
    });
    
    console.log(`📊 Verificación: ${sessionCount} sesiones para cliente ${updatedSession.clientId}`);
    console.log(`📊 Verificación: ${detailCount} detalles para sesión ${sessionId}`);

    if (detailCount > 1) {
      const allDetails = await queryRunner.manager.find(SessionDetail, {
        where: { sessionId: sessionId }
      });
      console.warn(`⚠️ ADVERTENCIA: Hay ${detailCount} detalles para esta sesión`);
      
      // Si hay más de un detalle, eliminar los extras (excepto el actual)
      const detailsToDelete = allDetails.filter(d => d.id !== detailToUpdate.id);
      for (const detail of detailsToDelete) {
        console.log(`🗑️ Eliminando detalle duplicado ID: ${detail.id}`);
        await queryRunner.manager.delete(SessionDetail, { id: detail.id });
      }
    }

    // 12. Commit
    await queryRunner.commitTransaction();
    console.log(`✅ Transacción completada exitosamente`);

    return {
      session: updatedSession,
      sessionDetail: updatedSessionDetail,
      calculations: recalculations,
      message: `Sesión ${sessionId} y su detalle (ID: ${detailToUpdate.id}) ACTUALIZADOS exitosamente. No se crearon nuevos registros.`
    };

  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error(`❌ Error en transacción: ${error.message}`);
    throw new BadRequestException(`Error al actualizar: ${error.message}`);
  } finally {
    await queryRunner.release();
  }
}

  async removeSessionWithDetails(sessionId: number): Promise<{ message: string }> {
    // 1. Buscar la sesión
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId }
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // 2. Buscar y eliminar todos los session_details relacionados
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId: sessionId }
    });

    // 3. Eliminar los session_details
    if (sessionDetails.length > 0) {
      await this.sessionDetailRepository.remove(sessionDetails);
      console.log(`✅ Eliminados ${sessionDetails.length} detalles de sesión`);
    }

    // 4. Eliminar la sesión
    await this.sessionRepository.remove(session);

    return {
      message: `Sesión eliminada Exitosamente`
    };
  }

  async remove(id: number, adminId?: number): Promise<{ message: string; deletedSession: SessionResponse }> {
    // Buscar la sesión con detalles
    const session = await this.sessionRepository.findOne({
      where: { id }
    });

    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }

    // Verificar permisos si se proporciona adminId
    if (adminId) {
      // Verificar que el administrador tiene una compañía
      const adminCompany = await this.companyRepository.findOne({
        where: { userId: adminId }
      });

      if (!adminCompany) {
        throw new NotFoundException('El administrador no tiene una compañía asignada');
      }

      // Verificar que la sesión pertenece a una compañía del admin
      const sessionDetails = await this.sessionDetailRepository.find({
        where: { sessionId: id }
      });

      let sessionBelongsToAdmin = false;

      for (const detail of sessionDetails) {
        const companyWorker = await this.companyWorkerRepository.findOne({
          where: { id: detail.companyWorkerId },
          relations: ['company']
        });

        if (companyWorker?.company?.id === adminCompany.id) {
          sessionBelongsToAdmin = true;
          break;
        }
      }

      if (!sessionBelongsToAdmin) {
        throw new BadRequestException('No tienes permiso para eliminar esta sesión');
      }
    }

    // Obtener información antes de eliminar para la respuesta
    const sessionInfo = await this.findOneWithDetails(id);

    // Eliminar primero los detalles de la sesión
    await this.sessionDetailRepository.delete({ sessionId: id });

    // Eliminar la sesión
    const result = await this.sessionRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }

    return {
      message: `Sesión ${id} eliminada exitosamente`,
      deletedSession: sessionInfo
    };
  }

  /**
   * Método para debugging: Obtener información completa de un cliente
   */
  async debugClient(clientId: number): Promise<any> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
      select: ['id', 'name', 'lastName', 'email', 'companies']
    });

    if (!client) {
      throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
    }

    return {
      client,
      companiesType: typeof client.companies,
      companiesLength: client.companies?.length || 0,
      companiesContent: client.companies,
      companiesArray: Array.isArray(client.companies),
      companiesJSON: JSON.stringify(client.companies)
    };
  }

  /**
  * Validar que el servicio tiene configuración correcta de porcentajes
  */
  private validateServicePercentages(service: Service): void {
    // Validar porcentaje general (si existe)
    if (service.percentage !== undefined && service.percentage !== null) {
      const percentage = Number(service.percentage);
      if (percentage < 0 || percentage > 100) {
        throw new BadRequestException(
          `El porcentaje general del servicio ${service.id} no es válido (${percentage}%). Debe estar entre 0 y 100`
        );
      }
    }

    // Si tiene workers asignados, verificar que cada uno tenga porcentaje válido
    if (service.workers && Array.isArray(service.workers) && service.workers.length > 0) {
      service.workers.forEach((worker, index) => {
        if (worker.percentage < 0 || worker.percentage > 100) {
          throw new BadRequestException(
            `El porcentaje del worker ${worker.id} en el servicio ${service.id} no es válido (${worker.percentage}%). Debe estar entre 0 y 100`
          );
        }
      });
    }

    // Validar que el servicio tenga al menos una forma de determinar el porcentaje
    const hasGeneralPercentage = service.percentage !== undefined && service.percentage !== null;
    const hasSpecificWorkers = service.workers && Array.isArray(service.workers) && service.workers.length > 0;

    if (!hasGeneralPercentage && !hasSpecificWorkers) {
      throw new BadRequestException(
        `El servicio ${service.id} no tiene configurado el porcentaje. ` +
        `Debe tener un porcentaje general o workers asignados con porcentajes específicos.`
      );
    }
  }


  private async sendConfirmationEmails(
    session: Session,
    sessionDetail: SessionDetail,
    clientId: number,
    companyWorkerId: number,
    serviceId: number,
    companyId: number
  ): Promise<void> {
    try {
      // Obtener información del cliente
      const clientInfo = await this.getClientInfo(clientId);

      // Obtener información del trabajador
      const workerInfo = await this.getWorkerInfo(companyWorkerId);

      // Obtener información del servicio
      const service = await this.serviceRepository.findOne({
        where: { id: serviceId }
      });

      // Obtener información de la compañía
      const company = await this.companyRepository.findOne({
        where: { id: companyId }
      });

      // Formatear fecha y hora usando el EmailService
      const formattedDate = this.emailService.formatSessionDate(session.sessionDatetime);

      // CONVERTIR EL COSTO A NÚMERO 
      const sessionCost = parseFloat(String(session.totalCost)) || 0;
      const serviceCost = parseFloat(String(service?.cost)) || 0;
      const finalCost = sessionCost || serviceCost;

      // Si el cliente tiene email, enviar correo de confirmación
      if (clientInfo.email) {
        await this.emailService.sendSessionConfirmationToClient(
          clientInfo.email,
          clientInfo.name,
          {
            date: formattedDate.date,
            time: formattedDate.time,
            serviceName: service?.name || 'Servicio',
            serviceCost: finalCost,
            serviceDuration: Number(session.totalTime) || Number(service?.standardTime) || 0
          },
          {
            name: workerInfo.name,
            phone: workerInfo.phone
          },
          {
            name: company?.name || '',
            address: company?.location || '',
            email: company?.email || ''
          }
        );
        this.logger.log(`✅ Correo de confirmación enviado al cliente: ${clientInfo.email}`);
      } else {
        this.logger.warn(`⚠️ Cliente sin email, no se envió correo de confirmación`);
      }

      // Si el trabajador tiene email, enviar correo de notificación
      if (workerInfo.email) {
        await this.emailService.sendSessionNotificationToWorker(
          workerInfo.email,
          workerInfo.name,
          {
            date: formattedDate.date,
            time: formattedDate.time,
            serviceName: service?.name || 'Servicio',
            clientName: clientInfo.name,
            clientPhone: clientInfo.phone,
            serviceCost: finalCost,
            serviceDuration: Number(session.totalTime) || Number(service?.standardTime) || 0
          },
          {
            name: clientInfo.name,
            phone: clientInfo.phone
          },
          {
            name: company?.name || '',
            address: company?.location || '',
            email: company?.email || ''
          }
        );
        this.logger.log(`✅ Correo de notificación enviado al trabajador: ${workerInfo.email}`);
      } else {
        this.logger.warn(`⚠️ Trabajador sin email, no se envió correo de notificación`);
      }

    } catch (error) {
      this.logger.error(`❌ Error enviando correos de confirmación: ${error.message}`, error.stack);
    }
  }

  /**
   * Obtener información del trabajador para el correo
   */
  private async getWorkerInfo(companyWorkerId: number): Promise<{
    email: string;
    name: string;
    phone: string;
  }> {
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: { id: companyWorkerId },
      relations: ['worker', 'worker.user']
    });

    if (!companyWorker || !companyWorker.worker) {
      throw new NotFoundException(`Trabajador con ID ${companyWorkerId} no encontrado`);
    }

    const worker = companyWorker.worker;
    const user = await this.userRepository.findOne({
      where: { id: worker.userId }
    });

    return {
      email: user?.email || '',
      name: `${worker.name || ''} ${worker.lastName || ''}`.trim() || user?.username || 'Trabajador',
      phone: worker.phone || ''
    };
  }

  /**
   * Obtener información del cliente para el correo
   */
  private async getClientInfo(clientId: number): Promise<{
    email: string;
    name: string;
    phone: string;
  }> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
      relations: ['user']
    });

    if (!client) {
      throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
    }

    // Obtener el usuario asociado al cliente
    const user = await this.userRepository.findOne({
      where: { id: client.userId }
    });

    return {
      email: client.email || user?.email || '',
      name: `${client.name || ''} ${client.lastName || ''}`.trim() || user?.username || 'Cliente',
      phone: client.phone || ''
    };
  }
  //------------------------------------------
  //                      LISTAS
  //------------------------------------------- 

  /**
   * Método alternativo más simple sin joins complejos
   */

  async findAllSessionsSimple(
    adminId: number,
    getSessionsDto: GetSessionsDto
  ): Promise<PaginationResult<any>> {
    const adminCompany = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!adminCompany) {
      throw new NotFoundException('El administrador no tiene una compañía asignada');
    }

    // Construir condiciones where
    const whereConditions: any = {};

    // Filtrar por fechas si se proporcionan
    if (getSessionsDto.startDate && getSessionsDto.endDate) {
      whereConditions.sessionDatetime = Between(
        new Date(getSessionsDto.startDate),
        new Date(getSessionsDto.endDate)
      );
    }

    if (getSessionsDto.clientId) {
      whereConditions.clientId = getSessionsDto.clientId;
    }

    if (getSessionsDto.sessionStatus !== undefined) {
      whereConditions.sessionStatus = getSessionsDto.sessionStatus;
    }

    // Determinar ordenamiento
    let order: any = {};
    switch (getSessionsDto.orderBy) {
      case 'recent':
        order = { sessionDatetime: 'DESC' };
        break;
      case 'oldest':
        order = { sessionDatetime: 'ASC' };
        break;
      case 'priority':
        order = { sessionStatus: 'ASC', sessionDatetime: 'ASC' };
        break;
      default:
        order = { sessionDatetime: 'DESC' };
    }

    // Obtener las sesiones directamente
    const [sessions, total] = await this.sessionRepository.findAndCount({
      where: whereConditions,
      order: order,
      skip: (getSessionsDto.page - 1) * getSessionsDto.limit,
      take: getSessionsDto.limit,
    });

    // Enriquecer los datos con información de clientes, compañías y detalles
    const enrichedSessions = await Promise.all(
      sessions.map(async (session) => {
        // Obtener cliente
        const client = await this.clientRepository.findOne({
          where: { id: session.clientId }
        });

        // Obtener detalles de la sesión
        const sessionDetails = await this.sessionDetailRepository.find({
          where: { sessionId: session.id }
        });

        let companyId = adminCompany.id;
        let companyName = adminCompany.name;
        let workerName = '';
        let workerLastName = '';
        let serviceName = '';

        if (sessionDetails.length > 0) {
          const firstDetail = sessionDetails[0];

          // Obtener companyWorker
          const companyWorker = await this.companyWorkerRepository.findOne({
            where: { id: firstDetail.companyWorkerId },
            relations: ['worker', 'company']
          });

          // Obtener servicio
          const service = await this.serviceRepository.findOne({
            where: { id: firstDetail.serviceId }
          });

          if (companyWorker?.company) {
            companyId = companyWorker.company.id;
            companyName = companyWorker.company.name;
          }

          if (companyWorker?.worker) {
            workerName = companyWorker.worker.name || '';
            workerLastName = companyWorker.worker.lastName || '';
          }

          if (service) {
            serviceName = service.name || '';
          }
        }

        return {
          id: session.id,
          clientId: session.clientId,
          clientName: client ? `${client.name || ''} ${client.lastName || ''}`.trim() : 'Cliente no encontrado',
          clientLastName: client?.lastName || '',
          companyId: companyId,
          companyName: companyName,
          sessionDatetime: session.sessionDatetime,
          sessionStatus: session.sessionStatus,
          sessionStatusText: this.getSessionStatusText(session.sessionStatus),
          totalCost: session.totalCost,
          totalTime: session.totalTime,
          startDatetime: session.startDatetime,
          status: session.status,
          workerName: workerName,
          workerLastName: workerLastName,
          serviceName: serviceName,
          createdAt: session['createdAt'] || null,
          updatedAt: session['updatedAt'] || null
        };
      })
    );

    return {
      data: enrichedSessions,
      meta: {
        page: getSessionsDto.page,
        limit: getSessionsDto.limit,
        total: total,
        totalPages: Math.ceil(total / getSessionsDto.limit),
        hasNext: getSessionsDto.page < Math.ceil(total / getSessionsDto.limit),
        hasPrev: getSessionsDto.page > 1,
      }
    };
  }
  //SE ESTABLE EL ESTATUS DE LA CITA
  private getSessionStatusText(status: number): string {
    const statusMap: Record<number, string> = {
      1: 'Agendado',
      2: 'En proceso',
      3: 'Completada',
      4: 'Pagado',

    };
    return statusMap[status] || 'Desconocido';
  }

}