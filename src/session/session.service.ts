import { Injectable, NotFoundException, BadRequestException} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { CreateSessionWithDetailDto } from './dto/create-session-with-detail.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { Client } from '../client/entities/client.entity';
import { Company } from '../company/entities/company.entity';
import { User } from '../user/entities/user.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { Service } from '../service/entities/service.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Between } from 'typeorm';

@Injectable()
export class SessionService {
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
  ) {}

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
    let companyPercentage = service.percentage || 0;
    let workerAssigned = false;

    // Buscar si el trabajador está asignado a este servicio
    if (service.workers && Array.isArray(service.workers)) {
      const workerAssignment = service.workers.find(
        (worker: any) => worker.id === companyWorkerId
      );
      
      if (workerAssignment) {
        workerPercentage = workerAssignment.percentage;
        workerAssigned = true;
      } else {
        console.warn(`⚠️ El trabajador ${companyWorkerId} no está asignado al servicio ${service.id}`);
      }
    }

    // Si no se encontró asignación específica, usar lógica alternativa
    if (!workerAssigned) {
      // Si el servicio tiene porcentaje de compañía, el trabajador recibe el resto
      if (companyPercentage > 0 && companyPercentage <= 100) {
        workerPercentage = 100 - companyPercentage;
        console.log(`ℹ️ Usando cálculo automático: Trabajador ${workerPercentage}%, Compañía ${companyPercentage}%`);
      } else {
        // Por defecto: 60% compañía, 40% trabajador
        companyPercentage = 60;
        workerPercentage = 40;
        console.log(`ℹ️ Usando valores por defecto: Trabajador 40%, Compañía 60%`);
      }
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
    // Calcular montos
    const totalWorker = (totalCost * workerPercentage) / 100;
    const totalCompany = (totalCost * companyPercentage) / 100;

    // Verificar que la suma sea aproximadamente igual al costo total (por redondeos)
    const totalCalculated = totalWorker + totalCompany;
    const difference = Math.abs(totalCost - totalCalculated);
    
    let calculationDetails = `Cálculo: ${totalCost} × (${workerPercentage}% trabajador + ${companyPercentage}% compañía) = ${totalWorker.toFixed(2)} + ${totalCompany.toFixed(2)}`;
    
    if (difference > 0.01) {
      console.warn(`⚠️ Diferencia en cálculo: ${totalCost} vs ${totalCalculated} (diferencia: ${difference.toFixed(2)})`);
      calculationDetails += ` | Diferencia: ${difference.toFixed(2)}`;
    }

    return {
      cost: totalCost,
      totalWorker: Number(totalWorker.toFixed(2)),
      totalCompany: Number(totalCompany.toFixed(2)),
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
      totalCost: createSessionWithDetailDto.totalCost,
      totalTime: createSessionWithDetailDto.totalTime,
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

    // DETERMINAR COSTO TOTAL
    let totalCost: number;
    
    // Prioridad: detailCost > totalCost > service.cost
    if (createSessionWithDetailDto.detailCost !== undefined) {
      totalCost = createSessionWithDetailDto.detailCost;
      console.log(`💰 Usando detailCost del DTO: ${totalCost}`);
    } else if (createSessionWithDetailDto.totalCost !== undefined) {
      totalCost = createSessionWithDetailDto.totalCost;
      console.log(`💰 Usando totalCost de la sesión: ${totalCost}`);
    } else {
      totalCost = service.cost || 0;
      console.log(`💰 Usando costo del servicio: ${totalCost}`);
    }

    // CALCULAR MONTOS
    const calculatedAmounts = this.calculateAmounts(totalCost, workerPercentage, companyPercentage);
    
    console.log(`📊 Cálculos: Costo=${calculatedAmounts.cost}, Trabajador=${calculatedAmounts.totalWorker} (${workerPercentage}%), Compañía=${calculatedAmounts.totalCompany} (${companyPercentage}%)`);

    // 9. Crear la sesión (nueva)
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
      totalTime: createSessionWithDetailDto.detailTotalTime || createSessionWithDetailDto.totalTime || service.standardTime || 0,
      totalWorker: calculatedAmounts.totalWorker,
      totalCompany: calculatedAmounts.totalCompany,
      // status por defecto es 1
      status: createSessionWithDetailDto.detailStatus !== undefined ? createSessionWithDetailDto.detailStatus : 1,
    };

    console.log(`📝 Creando SessionDetail:`, JSON.stringify(sessionDetailData, null, 2));

    const sessionDetail = this.sessionDetailRepository.create(sessionDetailData);
    const savedSessionDetail = await this.sessionDetailRepository.save(sessionDetail);

    // 12. Construir mensaje
    let message: string;
    
    if (wasAlreadyAssociated) {
      message = `Sesión y detalle creados exitosamente. El cliente YA estaba asociado a ${companyName}.`;
    } else {
      message = `Sesión y detalle creados exitosamente. Cliente ASOCIADO NUEVAMENTE a ${companyName}.`;
    }

    // 13. Obtener información del trabajador para el mensaje
    const workerInfo = companyWorker.worker ? 
      `${companyWorker.worker.name} ${companyWorker.worker.lastName}` : 
      `Trabajador ID: ${companyWorker.id}`;

    return {
      message: `${message} Trabajador asignado: ${workerInfo}.`,
      isNew,
      wasAlreadyAssociated,
      clientId: createSessionWithDetailDto.clientId,
      companyId,
      companiesBefore,
      companiesAfter,
      calculations: {
        totalCost: calculatedAmounts.cost,
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
   * Crear sesión y asociar compañía del administrador al cliente
   * Con validación de duplicados
   */
  async createSessionWithCompany(
    createSessionDto: CreateSessionDto,
    adminId: number
  ): Promise<{ 
    session: Session; 
    message: string; 
    isNew: boolean; 
    wasAlreadyAssociated: boolean;
    clientId: number;
    companyId: number | null;
    companiesBefore: number[];
    companiesAfter: number[];
  }> {
    // 1. Verificar que la sesión tiene un cliente
    if (!createSessionDto.clientId) {
      throw new BadRequestException('La sesión debe tener un cliente asociado');
    }

    // 2. Verificar si ya existe una sesión con los mismos datos
    const existingSession = await this.checkExistingSession(createSessionDto);
    let session: Session;
    let isNew = false;
    let wasAlreadyAssociated = false;
    let adminCompany: Company | null = null;
    let companiesBefore: number[] = [];
    let companiesAfter: number[] = [];

    if (existingSession) {
      // Usar la sesión existente
      session = existingSession;
      console.log(`⚠️ Usando sesión existente ID: ${session.id} para cliente ID: ${createSessionDto.clientId}`);
      
      return {
        session,
        message: `El cliente ya tiene una sesión con los mismos datos (ID: ${existingSession.id}).`,
        isNew: false,
        wasAlreadyAssociated: false,
        clientId: createSessionDto.clientId,
        companyId: null,
        companiesBefore: [],
        companiesAfter: []
      };
    } else {
      // 3. Obtener la compañía del administrador
      adminCompany = await this.companyRepository.findOne({
        where: { userId: adminId }
      });

      if (!adminCompany) {
        throw new NotFoundException('El administrador no tiene una compañía asignada');
      }

      // 4. Crear la sesión (con valores por defecto)
      const sessionDataWithDefaults = {
        ...createSessionDto,
        sessionStatus: createSessionDto.sessionStatus !== undefined ? createSessionDto.sessionStatus : 1,
        status: createSessionDto.status !== undefined ? createSessionDto.status : 1,
        startDatetime: createSessionDto.startDatetime || createSessionDto.sessionDatetime || new Date(),
      };

      session = await this.create(sessionDataWithDefaults, adminId);
      isNew = true;

      // 5. Asociar la compañía del administrador al cliente
      const client = await this.clientRepository.findOne({
        where: { id: createSessionDto.clientId }
      });

      if (!client) {
        throw new NotFoundException(`Cliente con ID ${createSessionDto.clientId} no encontrado`);
      }

      // Obtener las compañías actuales del cliente
      companiesBefore = client.companies || [];
      const currentCompanies = companiesBefore;
      const companyId = adminCompany.id;
      
      // Convertir todos a números para comparación segura
      const companyIds = currentCompanies.map(id => Number(id));
      const targetCompanyId = Number(companyId);
      
      if (!companyIds.includes(targetCompanyId)) {
        // Agregar la compañía al array de compañías del cliente
        const updatedCompanies = [...currentCompanies, targetCompanyId];
        companiesAfter = updatedCompanies;
        
        await this.clientRepository.update(client.id, {
          companies: updatedCompanies
        });
        wasAlreadyAssociated = false;
      } else {
        companiesAfter = currentCompanies;
        wasAlreadyAssociated = true;
      }
    }

    // Construir mensaje personalizado
    let message: string;
    
    const companyName = adminCompany ? adminCompany.name : 'la compañía';
    if (wasAlreadyAssociated) {
      message = `Sesión creada exitosamente. El cliente ya estaba asociado a ${companyName}.`;
    } else {
      message = `Sesión creada exitosamente. Cliente asociado a ${companyName}.`;
    }

    return {
      session,
      message,
      isNew,
      wasAlreadyAssociated,
      clientId: createSessionDto.clientId,
      companyId: adminCompany ? adminCompany.id : null,
      companiesBefore,
      companiesAfter
    };
  }

  /**
   * Asociar compañía del administrador a cliente después de crear una sesión
   */
  async associateCompanyToClient(
    sessionId: number,
    adminId: number
  ): Promise<{ message: string; client: Client }> {
    // 1. Obtener la sesión
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId }
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // 2. Obtener el cliente asociado a la sesión
    const clientId = session.clientId;
    let client = await this.clientRepository.findOne({
      where: { id: clientId }
    });

    if (!client) {
      throw new NotFoundException(`Cliente asociado a la sesión no encontrado`);
    }

    // 3. Obtener la compañía del administrador
    const adminCompany = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!adminCompany) {
      throw new NotFoundException('El administrador no tiene una compañía asignada');
    }

    const companyId = adminCompany.id;

    // 4. Verificar si el cliente ya está asociado a esta compañía
    const currentCompanies = client.companies || [];
    
    if (currentCompanies.includes(companyId)) {
      throw new BadRequestException(`El cliente ya está asociado a su compañía`);
    }

    // 5. Agregar la compañía al array de compañías del cliente
    const updatedCompanies = [...currentCompanies, companyId];
    
    await this.clientRepository.update(client.id, {
      companies: updatedCompanies
    });

    // 6. Obtener el cliente actualizado
    const updatedClient = await this.clientRepository.findOne({
      where: { id: clientId }
    });

    if (!updatedClient) {
      throw new NotFoundException('Error al obtener el cliente actualizado');
    }

    return {
      message: `Compañía "${adminCompany.name}" asociada exitosamente al cliente "${client.name || client.email}". Total de compañías: ${updatedCompanies.length}`,
      client: updatedClient
    };
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

  async update(id: number, updateSessionDto: UpdateSessionDto): Promise<Session> {
    const session = await this.sessionRepository.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }
    
    Object.assign(session, updateSessionDto);
    return await this.sessionRepository.save(session);
  }

  async remove(id: number): Promise<void> {
    const result = await this.sessionRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }
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
}