import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

    // 12. Construir mensaje
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
}