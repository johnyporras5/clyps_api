import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, Between } from 'typeorm';
import { Session } from './entities/session.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { CreateSessionWithDetailDto, SessionDetailItemDto } from './dto/create-session-with-detail.dto';
import { Client } from '../client/entities/client.entity';
import { Company } from '../company/entities/company.entity';
import { User } from '../user/entities/user.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { Service } from '../service/entities/service.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Worker } from '../worker/entities/worker.entity';
import { EmailService } from '../email/email.service';
import { PaginationResult } from '../common/dto/pagination.dto';
import { UpdateSessionDto } from './dto/update-session-and-detail.dto';
import { GetSessionsDto } from './dto/get-sessions.dto';
import { SessionResponse, SessionDetailResponse } from './types/session-response.type';
import { UpdateSessionStatusDto } from './dto/update-session-status.dto';
import { UpdateDetailStatusDto } from './dto/update-detail-status.dto';

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

  async create(createSessionDto: CreateSessionDto, adminId: number): Promise<Session> {
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

    const sessionData = {
      ...createSessionDto,
      sessionStatus: createSessionDto.sessionStatus !== undefined ? createSessionDto.sessionStatus : 1,
      status: createSessionDto.status !== undefined ? createSessionDto.status : 1,
      startDatetime: createSessionDto.startDatetime || createSessionDto.sessionDatetime || new Date(),
    };

    const session = this.sessionRepository.create(sessionData);
    return await this.sessionRepository.save(session);
  }

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

    if (service.workers && Array.isArray(service.workers) && service.workers.length > 0) {
      const workerAssignment = service.workers.find(
        (worker: any) => worker.id === companyWorkerId
      );

      if (workerAssignment) {
        workerPercentage = workerAssignment.percentage;
        workerAssigned = true;
      }
    }

    if (!workerAssigned) {
      if (service.percentage !== undefined && service.percentage !== null) {
        workerPercentage = Number(service.percentage);
      } else {
        throw new BadRequestException(
          `El servicio ${service.id} no tiene configurado el porcentaje para el trabajador.`
        );
      }
    }

    companyPercentage = 100 - workerPercentage;

    if (workerPercentage < 0 || workerPercentage > 100) {
      throw new BadRequestException(`El porcentaje del trabajador (${workerPercentage}%) debe estar entre 0 y 100`);
    }

    if (companyPercentage < 0 || companyPercentage > 100) {
      throw new BadRequestException(`El porcentaje de la compañía (${companyPercentage}%) debe estar entre 0 y 100`);
    }

    const total = workerPercentage + companyPercentage;
    if (Math.abs(total - 100) > 0.01) {
      throw new BadRequestException(`La suma de porcentajes (${total}%) debe ser 100%`);
    }

    return { workerPercentage, companyPercentage, workerAssigned };
  }

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
    const workerAmount = (totalCost * workerPercentage) / 100;
    const companyAmount = (totalCost * companyPercentage) / 100;

    const totalWorker = Number(workerAmount.toFixed(2));
    const totalCompany = Number(companyAmount.toFixed(2));

    const totalCalculated = totalWorker + totalCompany;
    let adjustedTotalWorker = totalWorker;
    let adjustedTotalCompany = totalCompany;

    if (Math.abs(totalCost - totalCalculated) > 0.01) {
      adjustedTotalCompany = Number((totalCost - totalWorker).toFixed(2));
    }

    const calculationDetails = `Cálculo: ${totalCost} × (${workerPercentage}% trabajador + ${companyPercentage}% compañía) = ${adjustedTotalWorker} + ${adjustedTotalCompany}`;

    return {
      cost: totalCost,
      totalWorker: adjustedTotalWorker,
      totalCompany: adjustedTotalCompany,
      calculationDetails
    };
  }

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
    calculations?: Array<{
      serviceId: number;
      serviceName: string;
      companyWorkerId: number;
      workerName: string;
      totalCost: number;
      totalTime: number;
      workerPercentage: number;
      companyPercentage: number;
      totalWorker: number;
      totalCompany: number;
      calculationDetails: string;
      workerAssigned: boolean;
    }>;
    createdDetails?: SessionDetail[];
    existingSession?: Session;
  }> {
    // 1. Validaciones iniciales
    if (!createSessionWithDetailDto.clientId) {
      throw new BadRequestException('La sesión debe tener un cliente asociado');
    }

    const adminCompany = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!adminCompany) {
      throw new NotFoundException('El administrador no tiene una compañía asignada');
    }

    const companyId = adminCompany.id;
    const companyName = adminCompany.name;

    if (!createSessionWithDetailDto.details || createSessionWithDetailDto.details.length === 0) {
      throw new BadRequestException('Debe proporcionar al menos un servicio');
    }

    // 2. Verificar si el cliente ya tiene una cita en la misma fecha y hora
    if (createSessionWithDetailDto.sessionDatetime) {
      const existingAppointment = await this.checkIfClientHasAppointmentAtSameTime(
        createSessionWithDetailDto.clientId,
        createSessionWithDetailDto.sessionDatetime,
        companyId
      );

      if (existingAppointment) {
        // Formatear la fecha y hora para mostrar en el mensaje
        const appointmentDate = new Date(existingAppointment.sessionDatetime);
        const formattedDate = appointmentDate.toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const formattedTime = appointmentDate.toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit'
        });

        throw new BadRequestException({
          message: `El cliente ya tiene una cita agendada para la misma fecha y hora.`,
          details: {
            existingAppointmentId: existingAppointment.id,
            clientId: existingAppointment.clientId,
            appointmentDateTime: existingAppointment.sessionDatetime,
            formattedDate: formattedDate,
            formattedTime: formattedTime,
            sessionStatus: existingAppointment.sessionStatus,
            statusText: this.getSessionStatusText(existingAppointment.sessionStatus)
          },
          suggestion: 'Por favor, seleccione una fecha y hora diferente para esta cita.'
        });
      }
    }

    // 3. Definir tipo para las validaciones de servicio
    type ServiceValidationType = {
      detail: SessionDetailItemDto;
      service: Service;
      companyWorker: CompanyWorker;
      workerPercentage: number;
      companyPercentage: number;
      workerAssigned: boolean;
      serviceCostNumber: number;
      calculatedAmounts: {
        cost: number;
        totalWorker: number;
        totalCompany: number;
        calculationDetails: string;
      };
      workerName: string;
      detailCost: number;
      detailTime: number;
    };

    // 4. Calcular todos los totales y validar ANTES de crear la sesión
    let totalSessionCost = 0;
    let totalSessionTime = 0;
    const calculations: Array<{
      serviceId: number;
      serviceName: string;
      companyWorkerId: number;
      workerName: string;
      totalCost: number;
      totalTime: number;
      workerPercentage: number;
      companyPercentage: number;
      totalWorker: number;
      totalCompany: number;
      calculationDetails: string;
      workerAssigned: boolean;
    }> = [];

    const serviceValidations: ServiceValidationType[] = [];

    // Pre-validar todos los servicios
    for (const detail of createSessionWithDetailDto.details) {
      const service = await this.serviceRepository.findOne({
        where: {
          id: detail.serviceId,
          companyId: adminCompany.id
        }
      });

      if (!service) {
        throw new NotFoundException(`Servicio con ID ${detail.serviceId} no encontrado o no pertenece a tu compañía`);
      }

      const companyWorker = await this.companyWorkerRepository.findOne({
        where: {
          id: detail.companyWorkerId,
          companyId: adminCompany.id
        },
        relations: ['worker']
      });

      if (!companyWorker) {
        throw new NotFoundException(`Trabajador de compañía con ID ${detail.companyWorkerId} no encontrado o no pertenece a tu compañía`);
      }

      if (companyWorker.isActive !== 1) {
        throw new BadRequestException(`El trabajador de compañía con ID ${detail.companyWorkerId} no está activo`);
      }

      // Validar porcentajes del servicio
      this.validateServicePercentages(service);

      const { workerPercentage, companyPercentage, workerAssigned } = this.calculatePercentages(
        service,
        detail.companyWorkerId
      );

      let serviceCost = service.cost || 0;

      // Convertir a número decimal de forma segura
      let serviceCostNumber: number;
      if (typeof serviceCost === 'string') {
        serviceCostNumber = parseFloat(serviceCost);
      } else if (typeof serviceCost === 'number') {
        serviceCostNumber = serviceCost;
      } else if (serviceCost && typeof serviceCost === 'object') {
        serviceCostNumber = parseFloat(String(serviceCost));
      } else {
        serviceCostNumber = 0;
      }

      if (serviceCostNumber <= 0) {
        throw new BadRequestException(`El costo del servicio "${service.name}" debe ser mayor a 0`);
      }

      const calculatedAmounts = this.calculateAmounts(serviceCostNumber, workerPercentage, companyPercentage);

      // Acumular totales - asegurando que sean números
      const detailCost = calculatedAmounts.cost;
      const detailTime = service.standardTime || 0;

      totalSessionCost += detailCost;
      totalSessionTime += detailTime;

      const workerName = companyWorker.worker
        ? `${companyWorker.worker.name || ''} ${companyWorker.worker.lastName || ''}`.trim()
        : `Trabajador ID: ${companyWorker.id}`;

      // Guardar para usar después
      serviceValidations.push({
        detail,
        service,
        companyWorker,
        workerPercentage,
        companyPercentage,
        workerAssigned,
        serviceCostNumber,
        calculatedAmounts,
        workerName,
        detailCost,
        detailTime
      });

      calculations.push({
        serviceId: detail.serviceId,
        serviceName: service.name || '',
        companyWorkerId: detail.companyWorkerId,
        workerName: workerName,
        totalCost: detailCost,
        totalTime: detailTime,
        workerPercentage,
        companyPercentage,
        totalWorker: calculatedAmounts.totalWorker,
        totalCompany: calculatedAmounts.totalCompany,
        calculationDetails: calculatedAmounts.calculationDetails,
        workerAssigned
      });
    }

    // 5. Crear datos de la sesión con los totales calculados
    const sessionData: CreateSessionDto = {
      clientId: createSessionWithDetailDto.clientId,
      sessionDatetime: createSessionWithDetailDto.sessionDatetime,
      sessionStatus: createSessionWithDetailDto.sessionStatus !== undefined ? createSessionWithDetailDto.sessionStatus : 1,
      totalCost: totalSessionCost, // Usar totales calculados
      totalTime: totalSessionTime, // Usar totales calculados
      iaResponse: createSessionWithDetailDto.iaResponse,
      startDatetime: createSessionWithDetailDto.startDatetime || createSessionWithDetailDto.sessionDatetime || new Date(),
      status: createSessionWithDetailDto.status !== undefined ? createSessionWithDetailDto.status : 1,
    };

    // 6. Verificar si ya existe una sesión con los mismos datos
    const existingSession = await this.checkExistingSession(sessionData);

    if (existingSession) {
      const existingDetails: SessionDetail[] = [];

      for (const validation of serviceValidations) {
        const existingDetail = await this.checkExistingSessionDetail(
          existingSession.id,
          validation.detail.serviceId,
          validation.detail.companyWorkerId
        );

        if (existingDetail) {
          existingDetails.push(existingDetail);
        }
      }

      if (existingDetails.length === createSessionWithDetailDto.details.length) {
        throw new BadRequestException({
          message: `El cliente ya tiene una sesión con los mismos datos y todos los servicios ya están asignados.`,
          existingSession,
          existingDetails,
          recommendation: 'Si desea modificar la sesión existente, use el endpoint de actualización.'
        });
      }

      return {
        message: `El cliente ya tiene una sesión con los mismos datos (ID: ${existingSession.id}). Para agregar nuevos servicios, debe crear una nueva sesión con datos diferentes.`,
        isNew: false,
        wasAlreadyAssociated: false,
        clientId: createSessionWithDetailDto.clientId,
        companyId: companyId,
        companiesBefore: [],
        companiesAfter: [],
        existingSession: existingSession
      };
    }

    // 7. Crear la sesión (con los totales ya calculados)
    const session = await this.create(sessionData, adminId);
    const isNew = true;
    const createdDetails: SessionDetail[] = [];

    // 8. Crear los detalles de sesión
    for (const validation of serviceValidations) {
      const { detail, service, companyWorker, calculatedAmounts, detailTime } = validation;

      const sessionDetailData = {
        cost: calculatedAmounts.cost,
        serviceId: detail.serviceId,
        companyWorkerId: detail.companyWorkerId,
        sessionId: session.id,
        startDatetime: detail.detailStartDatetime || session.startDatetime,
        totalTime: detailTime,
        totalWorker: calculatedAmounts.totalWorker,
        totalCompany: calculatedAmounts.totalCompany,
        status: detail.detailStatus !== undefined ? detail.detailStatus : 1,
      };

      try {
        const sessionDetail = this.sessionDetailRepository.create(sessionDetailData);
        const savedSessionDetail = await this.sessionDetailRepository.save(sessionDetail);
        createdDetails.push(savedSessionDetail);

        // Enviar correos de confirmación para este servicio
        await this.sendConfirmationEmails(
          session,
          savedSessionDetail,
          createSessionWithDetailDto.clientId,
          detail.companyWorkerId,
          detail.serviceId,
          companyId
        );
      } catch (error) {
        // Si falla algún detalle, eliminar todo lo creado
        if (createdDetails.length > 0) {
          await this.sessionDetailRepository.remove(createdDetails);
        }

        await this.sessionRepository.delete({
          id: session.id,
          clientId: session.clientId
        });

        throw new BadRequestException(`Error al crear el detalle para el servicio ${service.name}: ${error.message}`);
      }
    }

    // 9. Verificar y actualizar las compañías del cliente
    let wasAlreadyAssociated = false;
    let companiesBefore: number[] = [];
    let companiesAfter: number[] = [];

    const client = await this.clientRepository.findOne({
      where: { id: createSessionWithDetailDto.clientId }
    });

    if (!client) {
      // Eliminar todo lo creado
      await this.sessionDetailRepository
        .createQueryBuilder()
        .delete()
        .where("sessionId = :sessionId", { sessionId: session.id })
        .execute();

      await this.sessionRepository.delete({
        id: session.id,
        clientId: session.clientId
      });

      throw new NotFoundException(`Cliente con ID ${createSessionWithDetailDto.clientId} no encontrado`);
    }

    companiesBefore = client.companies || [];
    const companyIds = companiesBefore.map(id => Number(id));
    const targetCompanyId = Number(companyId);

    if (!companyIds.includes(targetCompanyId)) {
      const updatedCompanies = [...companiesBefore, targetCompanyId];
      companiesAfter = updatedCompanies;

      await this.clientRepository.update(client.id, {
        companies: updatedCompanies
      });

      wasAlreadyAssociated = false;
      console.log(`✅ Cliente ${client.id} asociado a compañía ${companyId}`);
    } else {
      companiesAfter = companiesBefore;
      wasAlreadyAssociated = true;
      console.log(`ℹ️ Cliente ${client.id} ya estaba asociado a compañía ${companyId}`);
    }

    // 10. Construir mensaje de éxito
    let message: string;

    if (wasAlreadyAssociated) {
      message = `Sesión creada exitosamente con ${createdDetails.length} servicio(s). El cliente YA estaba asociado a ${companyName}.`;
    } else {
      message = `Sesión creada exitosamente con ${createdDetails.length} servicio(s). El cliente ha sido asociado a ${companyName}.`;
    }

    // 11. Mostrar resumen en consola para debugging
    console.log('📊 RESUMEN DE CREACIÓN DE SESIÓN:');
    console.log(`- Sesión ID: ${session.id}`);
    console.log(`- Cliente ID: ${session.clientId}`);
    console.log(`- Total Costo: $${totalSessionCost}`);
    console.log(`- Total Tiempo: ${totalSessionTime} minutos`);
    console.log(`- Servicios creados: ${createdDetails.length}`);
    console.log(`- Compañía: ${companyName} (ID: ${companyId})`);

    return {
      message,
      isNew,
      wasAlreadyAssociated,
      clientId: createSessionWithDetailDto.clientId,
      companyId,
      companiesBefore,
      companiesAfter,
      calculations,
      createdDetails
    };
  }

  /**
   * Verificar si el cliente ya tiene una cita en la misma fecha y hora
   * Opcional: Puedes agregar un margen de tiempo (ej: 30 minutos) para considerar "misma hora"
   */
  private async checkIfClientHasAppointmentAtSameTime(
    clientId: number,
    sessionDatetime: Date,
    companyId: number
  ): Promise<Session | null> {
    if (!sessionDatetime) {
      return null;
    }

    // Convertir a fecha para comparación
    const appointmentDate = new Date(sessionDatetime);

    // Opción 1: Buscar citas en la misma fecha exacta
    const startOfDay = new Date(appointmentDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(appointmentDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Opción 2: Buscar citas con un margen de tiempo (ej: 30 minutos antes/después)
    const timeMarginMinutes = 30; // Puedes ajustar este valor
    const startTime = new Date(appointmentDate.getTime() - timeMarginMinutes * 60000);
    const endTime = new Date(appointmentDate.getTime() + timeMarginMinutes * 60000);

    // Buscar sesiones del cliente en el mismo día
    const sessionsSameDay = await this.sessionRepository.find({
      where: {
        clientId: clientId,
        sessionDatetime: Between(startOfDay, endOfDay)
      }
    });

    if (sessionsSameDay.length === 0) {
      return null;
    }

    // Verificar si alguna de las sesiones está en la misma hora (con margen)
    for (const session of sessionsSameDay) {
      const existingAppointmentTime = new Date(session.sessionDatetime).getTime();
      const newAppointmentTime = appointmentDate.getTime();

      // Calcular diferencia en minutos
      const timeDifference = Math.abs(existingAppointmentTime - newAppointmentTime) / (1000 * 60);

      // Si la diferencia es menor al margen establecido, considerar que es la misma hora
      if (timeDifference <= timeMarginMinutes) {
        // Verificar también que la sesión pertenezca a la misma compañía
        // Para esto, necesitamos verificar los sessionDetails
        const sessionDetails = await this.sessionDetailRepository.find({
          where: { sessionId: session.id }
        });

        if (sessionDetails.length > 0) {
          // Verificar si algún detalle pertenece a la compañía actual
          for (const detail of sessionDetails) {
            const companyWorker = await this.companyWorkerRepository.findOne({
              where: { id: detail.companyWorkerId },
              relations: ['company']
            });

            if (companyWorker?.company?.id === companyId) {
              return session; // Encontramos una cita en la misma compañía a la misma hora
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Método alternativo más simple: Verificar si hay sesiones en el mismo día
   * (sin verificar margen de tiempo)
   */
  private async checkIfClientHasAppointmentOnSameDay(
    clientId: number,
    sessionDatetime: Date,
    companyId: number
  ): Promise<Session | null> {
    if (!sessionDatetime) {
      return null;
    }

    const appointmentDate = new Date(sessionDatetime);
    const startOfDay = new Date(appointmentDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(appointmentDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Buscar sesiones del cliente en el mismo día
    const sessions = await this.sessionRepository.find({
      where: {
        clientId: clientId,
        sessionDatetime: Between(startOfDay, endOfDay)
      },
      order: {
        sessionDatetime: 'ASC'
      }
    });

    if (sessions.length === 0) {
      return null;
    }

    // Verificar si alguna sesión pertenece a la misma compañía
    for (const session of sessions) {
      const sessionDetails = await this.sessionDetailRepository.find({
        where: { sessionId: session.id }
      });

      for (const detail of sessionDetails) {
        const companyWorker = await this.companyWorkerRepository.findOne({
          where: { id: detail.companyWorkerId },
          relations: ['company']
        });

        if (companyWorker?.company?.id === companyId) {
          return session; // Encontramos una cita en la misma compañía el mismo día
        }
      }
    }

    return null;
  }

  private async checkExistingSession(createSessionDto: CreateSessionDto): Promise<Session | null> {
    if (!createSessionDto.clientId) {
      return null;
    }

    const whereConditions: any = {
      clientId: createSessionDto.clientId
    };

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

    const existingSession = await this.sessionRepository.findOne({
      where: whereConditions
    });

    return existingSession;
  }

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

    // Obtener TODOS los detalles de la sesión
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId: session.id }
    });

    // Variables para almacenar información general
    let companyId = 0;
    let companyName = 'Compañía no encontrada';

    // Array para almacenar todos los detalles
    const details: SessionDetailResponse[] = [];

    // Variables para calcular totales
    let totalCost = 0;
    let totalTime = 0;

    // Procesar CADA detalle de la sesión
    for (const detail of sessionDetails) {
      // Obtener información del servicio
      const service = await this.serviceRepository.findOne({
        where: { id: detail.serviceId }
      });

      // Obtener información del trabajador
      const companyWorker = await this.companyWorkerRepository.findOne({
        where: { id: detail.companyWorkerId },
        relations: ['worker', 'company']
      });

      // Si es el primer detalle, tomar la compañía (asumimos que todos son de la misma compañía)
      if (companyId === 0 && companyWorker?.company) {
        companyId = companyWorker.company.id;
        companyName = companyWorker.company.name;
      }

      // Calcular porcentajes
      let workerPercentage = 0;
      let companyPercentage = 0;

      if (detail.cost && detail.cost > 0) {
        workerPercentage = (Number(detail.totalWorker) / Number(detail.cost)) * 100;
        companyPercentage = (Number(detail.totalCompany) / Number(detail.cost)) * 100;
      }

      // Agregar detalle al array
      details.push({
        id: detail.id,
        cost: Number(detail.cost || 0),
        serviceId: detail.serviceId,
        serviceName: service?.name || 'Servicio no encontrado',
        serviceDescription: service?.description || '',
        companyWorkerId: detail.companyWorkerId,
        workerName: companyWorker?.worker?.name || '',
        workerLastName: companyWorker?.worker?.lastName || '',
        startDatetime: detail.startDatetime,
        totalTime: detail.totalTime || 0,
        totalWorker: Number(detail.totalWorker || 0),
        totalCompany: Number(detail.totalCompany || 0),
        status: detail.status || 1,
        workerPercentage: Number(workerPercentage.toFixed(2)),
        companyPercentage: Number(companyPercentage.toFixed(2))
      });

      // Acumular totales
      totalCost += Number(detail.cost || 0);
      totalTime += Number(detail.totalTime || 0);
    }

    // Si no se encontró información de compañía en los detalles
    if (companyName === 'Compañía no encontrada') {
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
      totalTime: totalTime,
      startDatetime: session.startDatetime || session.sessionDatetime,
      status: session.status || 1,
      iaResponse: session.iaResponse,
      createdAt: (session as any).createdAt || null,
      updatedAt: (session as any).updatedAt || null,
      details: details // Incluir todos los detalles
    };

    return response;
  }

  async updateSessionDates(
    sessionId: number,
    updateSessionDto: UpdateSessionDto,
    adminId: number
  ): Promise<{
    session: Session;
    updatedDetails: number;
    message: string;
  }> {
    console.log(`🔄 Actualizando fechas de sesión ${sessionId} y todos sus detalles`);

    // 1. Verificar permisos
    const adminCompany = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!adminCompany) {
      throw new NotFoundException('El administrador no tiene una compañía asignada');
    }

    // 2. Buscar la sesión
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId }
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // 3. Buscar TODOS los detalles de la sesión
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId: sessionId }
    });

    if (sessionDetails.length === 0) {
      throw new NotFoundException(`No se encontraron detalles para la sesión ${sessionId}`);
    }

    const queryRunner = this.sessionRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 4. Actualizar fecha de la sesión
      let newSessionDatetime = session.sessionDatetime;
      let updatedSession: Session = session; // Inicializar con la sesión existente

      if (updateSessionDto.sessionDatetime !== undefined) {
        newSessionDatetime = new Date(updateSessionDto.sessionDatetime);

        await queryRunner.manager.update(
          Session,
          { id: sessionId, clientId: session.clientId },
          {
            sessionDatetime: newSessionDatetime,
            startDatetime: newSessionDatetime
          }
        );
        console.log(`✅ Fecha de sesión actualizada a ${newSessionDatetime}`);

        // Obtener la sesión actualizada después del update
        const foundSession = await queryRunner.manager.findOne(Session, {
          where: { id: sessionId }
        });

        if (foundSession) {
          updatedSession = foundSession;
        }
      }

      // 5. Actualizar fechas de TODOS los detalles
      let updatedCount = 0;
      for (const detail of sessionDetails) {
        const updateData: Partial<SessionDetail> = {};

        // Si se proporciona detailStartDatetime específico para este detalle
        if (updateSessionDto.detailStartDatetime !== undefined &&
          detail.id === updateSessionDto.detailId) {
          updateData.startDatetime = new Date(updateSessionDto.detailStartDatetime);
        }
        // Si solo se actualizó la fecha de sesión, actualizar todos los detalles
        else if (updateSessionDto.sessionDatetime !== undefined) {
          updateData.startDatetime = newSessionDatetime;
        }

        if (Object.keys(updateData).length > 0) {
          await queryRunner.manager.update(
            SessionDetail,
            {
              id: detail.id,
              serviceId: detail.serviceId,
              companyWorkerId: detail.companyWorkerId,
              sessionId: detail.sessionId
            },
            updateData
          );
          updatedCount++;
        }
      }

      await queryRunner.commitTransaction();

      // 6. Verificar que la sesión aún existe después de la transacción
      const finalSession = await this.sessionRepository.findOne({
        where: { id: sessionId }
      });

      if (!finalSession) {
        throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada después de la actualización`);
      }

      return {
        session: finalSession,
        updatedDetails: updatedCount,
        message: `Fechas actualizadas exitosamente. ${updatedCount} detalle(s) modificado(s).`
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(`Error al actualizar fechas: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }
  async removeSessionWithDetails(sessionId: number): Promise<{ message: string }> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId }
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    await this.sessionDetailRepository
      .createQueryBuilder()
      .delete()
      .where("sessionId = :sessionId", { sessionId: sessionId })
      .execute();

    // CORRECCIÓN: Eliminar con PK compuesta
    await this.sessionRepository.delete({
      id: session.id,
      clientId: session.clientId
    });

    return {
      message: `Sesión eliminada Exitosamente`
    };
  }

  async remove(id: number, adminId?: number): Promise<{ message: string; deletedSession: SessionResponse }> {
    const session = await this.sessionRepository.findOne({
      where: { id }
    });

    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }

    if (adminId) {
      const adminCompany = await this.companyRepository.findOne({
        where: { userId: adminId }
      });

      if (!adminCompany) {
        throw new NotFoundException('El administrador no tiene una compañía asignada');
      }

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

    const sessionInfo = await this.findOneWithDetails(id);

    await this.sessionDetailRepository
      .createQueryBuilder()
      .delete()
      .where("sessionId = :sessionId", { sessionId: id })
      .execute();

    // CORRECCIÓN: Eliminar con PK compuesta
    const result = await this.sessionRepository.delete({
      id: session.id,
      clientId: session.clientId
    });

    if (result.affected === 0) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }

    return {
      message: `Sesión ${id} eliminada exitosamente`,
      deletedSession: sessionInfo
    };
  }

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

  private validateServicePercentages(service: Service): void {
    if (service.percentage !== undefined && service.percentage !== null) {
      const percentage = Number(service.percentage);
      if (percentage < 0 || percentage > 100) {
        throw new BadRequestException(
          `El porcentaje general del servicio ${service.id} no es válido (${percentage}%). Debe estar entre 0 y 100`
        );
      }
    }

    if (service.workers && Array.isArray(service.workers) && service.workers.length > 0) {
      service.workers.forEach((worker, index) => {
        if (worker.percentage < 0 || worker.percentage > 100) {
          throw new BadRequestException(
            `El porcentaje del worker ${worker.id} en el servicio ${service.id} no es válido (${worker.percentage}%). Debe estar entre 0 y 100`
          );
        }
      });
    }

    const hasGeneralPercentage = service.percentage !== undefined && service.percentage !== null;
    const hasSpecificWorkers = service.workers && Array.isArray(service.workers) && service.workers.length > 0;

    if (!hasGeneralPercentage && !hasSpecificWorkers) {
      throw new BadRequestException(
        `El servicio ${service.id} no tiene configurado el porcentaje.`
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
      const clientInfo = await this.getClientInfo(clientId);
      const workerInfo = await this.getWorkerInfo(companyWorkerId);
      const service = await this.serviceRepository.findOne({
        where: { id: serviceId }
      });

      const company = await this.companyRepository.findOne({
        where: { id: companyId }
      });

      const formattedDate = this.emailService.formatSessionDate(session.sessionDatetime);

      const sessionCost = parseFloat(String(session.totalCost)) || 0;
      const serviceCost = parseFloat(String(service?.cost)) || 0;
      const finalCost = sessionCost || serviceCost;

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
      }

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
      }

    } catch (error) {
      this.logger.error(`❌ Error enviando correos de confirmación: ${error.message}`, error.stack);
    }
  }

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

    const user = await this.userRepository.findOne({
      where: { id: client.userId }
    });

    return {
      email: client.email || user?.email || '',
      name: `${client.name || ''} ${client.lastName || ''}`.trim() || user?.username || 'Cliente',
      phone: client.phone || ''
    };
  }

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

    // Obtener las sesiones
    const [sessions, total] = await this.sessionRepository.findAndCount({
      where: whereConditions,
      order: order,
      skip: (getSessionsDto.page - 1) * getSessionsDto.limit,
      take: getSessionsDto.limit,
    });

    // Enriquecer los datos con información completa
    const enrichedSessions = await Promise.all(
      sessions.map(async (session) => {
        // Obtener cliente
        const client = await this.clientRepository.findOne({
          where: { id: session.clientId }
        });

        // Obtener TODOS los detalles de la sesión
        const sessionDetails = await this.sessionDetailRepository.find({
          where: { sessionId: session.id }
        });

        let companyId = adminCompany.id;
        let companyName = adminCompany.name;

        // Array para servicios
        const services: any[] = [];

        // Calcular totales sumando los detalles
        let totalCost = 0;
        let totalTime = 0;

        if (sessionDetails.length > 0) {
          // Procesar cada detalle
          for (const detail of sessionDetails) {
            // Obtener companyWorker
            const companyWorker = await this.companyWorkerRepository.findOne({
              where: { id: detail.companyWorkerId },
              relations: ['worker', 'company']
            });

            // Obtener servicio
            const service = await this.serviceRepository.findOne({
              where: { id: detail.serviceId }
            });

            // Si es el primer detalle y tiene compañía, usar esa
            if (companyId === adminCompany.id && companyWorker?.company) {
              companyId = companyWorker.company.id;
              companyName = companyWorker.company.name;
            }

            // Agregar servicio al array
            services.push({
              serviceId: detail.serviceId,
              serviceName: service?.name || '',
              serviceDescription: service?.description || '',
              serviceCost: Number(detail.cost || 0),
              serviceTime: detail.totalTime || 0,
              companyWorkerId: detail.companyWorkerId,
              workerName: companyWorker?.worker ?
                `${companyWorker.worker.name || ''} ${companyWorker.worker.lastName || ''}`.trim() : '',
              workerLastName: companyWorker?.worker?.lastName || '',
              totalWorker: Number(detail.totalWorker || 0),
              totalCompany: Number(detail.totalCompany || 0),
              detailStatus: detail.status || 1
            });

            // Acumular totales
            totalCost += Number(detail.cost || 0);
            totalTime += Number(detail.totalTime || 0);
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
          totalCost: totalCost, // Usar total calculado de los detalles
          totalTime: totalTime, // Usar total calculado de los detalles
          startDatetime: session.startDatetime,
          status: session.status,
          iaResponse: session.iaResponse,
          servicesCount: sessionDetails.length, // Número de servicios
          services: services, // Array con todos los servicios
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

  private getSessionStatusText(status: number): string {
    const statusMap: Record<number, string> = {
      1: 'Agendado',
      2: 'En proceso',
      3: 'Completada',
      4: 'Pagado',
    };
    return statusMap[status] || 'Desconocido';
  }


async updateSessionStatus(
  sessionId: number,
  updateSessionStatusDto: UpdateSessionStatusDto,
  adminId: number
): Promise<{
  message: string;
  session: Session;
  updated: boolean;
  validationDetails: {
    canUpdate: boolean;
    totalDetails: number;
    completedDetails: number;
    pendingDetails: number;
    allDetailsCompleted: boolean;
    errorMessage?: string;
  };
}> {
  console.log(`🔄 Actualizando estado de sesión ${sessionId} a ${updateSessionStatusDto.sessionStatus}`);

  // 1. Verificar permisos
  const adminCompany = await this.companyRepository.findOne({
    where: { userId: adminId }
  });

  if (!adminCompany) {
    throw new NotFoundException('El administrador no tiene una compañía asignada');
  }

  // 2. Buscar la sesión
  const session = await this.sessionRepository.findOne({
    where: { id: sessionId }
  });

  if (!session) {
    throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
  }

  // 3. Verificar que la sesión pertenezca a la compañía del administrador
  const sessionDetails = await this.sessionDetailRepository.find({
    where: { sessionId: sessionId }
  });

  if (sessionDetails.length === 0) {
    throw new NotFoundException(`No se encontraron detalles para la sesión ${sessionId}`);
  }

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
    throw new ForbiddenException('No tienes permiso para modificar esta sesión');
  }

  // 4. Validar si se puede actualizar el estado de la sesión
  const validationResult = await this.validateSessionStatusUpdate(
    sessionId,
    updateSessionStatusDto.sessionStatus
  );

  if (!validationResult.canUpdate) {
    throw new BadRequestException({
      message: 'No se puede actualizar el estado de la sesión',
      details: validationResult,
      suggestion: validationResult.errorMessage || 'Revise las reglas de validación.'
    });
  }

  // 5. Actualizar el estado de la sesión
  const previousStatus = session.sessionStatus;
  session.sessionStatus = updateSessionStatusDto.sessionStatus;

  const updatedSession = await this.sessionRepository.save(session);

  console.log(`✅ Estado de sesión ${sessionId} actualizado de ${previousStatus} a ${updateSessionStatusDto.sessionStatus}`);

  return {
    message: `Estado de sesión actualizado exitosamente de ${this.getSessionStatusText(previousStatus)} a ${this.getSessionStatusText(updateSessionStatusDto.sessionStatus)}`,
    session: updatedSession,
    updated: true,
    validationDetails: validationResult
  };
}

async updateDetailStatus(
  detailId: number,
  updateDetailStatusDto: UpdateDetailStatusDto,
  adminId: number
): Promise<{
  message: string;
  detail: SessionDetail;
  sessionUpdated: boolean;
  newSessionStatus: number | null;
  validation: {
    canUpdateDetail: boolean;
    detailPreviousStatus: number;
    sessionId: number;
  };
}> {
  console.log(`🔄 Actualizando estado del detalle ${detailId} a ${updateDetailStatusDto.status}`);

  // 1. Verificar permisos
  const adminCompany = await this.companyRepository.findOne({
    where: { userId: adminId }
  });

  if (!adminCompany) {
    throw new NotFoundException('El administrador no tiene una compañía asignada');
  }

  // 2. Buscar el detalle
  const detail = await this.sessionDetailRepository.findOne({
    where: { id: detailId }
  });

  if (!detail) {
    throw new NotFoundException(`Detalle de sesión con ID ${detailId} no encontrado`);
  }

  // 3. Verificar que el detalle pertenezca a la compañía del administrador
  const companyWorker = await this.companyWorkerRepository.findOne({
    where: { id: detail.companyWorkerId },
    relations: ['company']
  });

  if (!companyWorker || companyWorker.company.id !== adminCompany.id) {
    throw new ForbiddenException('No tienes permiso para modificar este detalle');
  }

  // 4. Guardar estado anterior
  const previousStatus = detail.status;

  // 5. Validar que el nuevo estado sea válido (1-3 para detalles)
  if (updateDetailStatusDto.status < 1 || updateDetailStatusDto.status > 3) {
    throw new BadRequestException('El estado del detalle debe ser: 1 (Agendado), 2 (En proceso) o 3 (Completado)');
  }

  // 6. Actualizar el detalle
  detail.status = updateDetailStatusDto.status;

  const updatedDetail = await this.sessionDetailRepository.save(detail);

  // 7. Verificar si todos los detalles de la sesión están completados
  const sessionDetails = await this.sessionDetailRepository.find({
    where: { sessionId: detail.sessionId }
  });

  const allDetailsCompleted = sessionDetails.every(d => d.status === 3);
  let sessionUpdated = false;
  let newSessionStatus: number | null = null;

  const session = await this.sessionRepository.findOne({
    where: { id: detail.sessionId }
  });

  // 8. Si la sesión existe, actualizar su estado según corresponda
  if (session) {
    // Si todos los detalles están completados, actualizar la sesión a completada (3)
    if (allDetailsCompleted) {
      if (session.sessionStatus !== 3) {
        session.sessionStatus = 3; // Completada
        await this.sessionRepository.save(session);
        sessionUpdated = true;
        newSessionStatus = 3;
        console.log(`✅ Sesión ${session.id} actualizada a COMPLETADA automáticamente`);
      }
    } else {
      // Si no todos están completados, asegurarse de que la sesión no esté como completada o pagada
      if (session.sessionStatus === 3 || session.sessionStatus === 4) {
        // Solo revertir a "en proceso" si estaba como completada o pagada
        session.sessionStatus = 2;
        await this.sessionRepository.save(session);
        sessionUpdated = true;
        newSessionStatus = 2;
        console.log(`⚠️ Sesión ${session.id} revertida a "EN PROCESO" porque no todos los detalles están completados`);
      }
    }
  } else {
    console.warn(`⚠️ Sesión con ID ${detail.sessionId} no encontrada al actualizar el detalle`);
  }

  console.log(`✅ Detalle ${detailId} actualizado de ${previousStatus} a ${updateDetailStatusDto.status}`);

  return {
    message: `Estado del detalle actualizado exitosamente de ${this.getDetailStatusText(previousStatus)} a ${this.getDetailStatusText(updateDetailStatusDto.status)}`,
    detail: updatedDetail,
    sessionUpdated,
    newSessionStatus,
    validation: {
      canUpdateDetail: true,
      detailPreviousStatus: previousStatus,
      sessionId: detail.sessionId
    }
  };
}

private async validateSessionStatusUpdate(
  sessionId: number,
  newSessionStatus: number
): Promise<{
  canUpdate: boolean;
  totalDetails: number;
  completedDetails: number;
  pendingDetails: number;
  allDetailsCompleted: boolean;
  detailsStatus: Array<{
    id: number;
    serviceId: number;
    status: number;
    statusText: string;
  }>;
  errorMessage?: string;
}> {
  // Obtener todos los detalles de la sesión
  const sessionDetails = await this.sessionDetailRepository.find({
    where: { sessionId: sessionId }
  });

  const totalDetails = sessionDetails.length;
  const completedDetails = sessionDetails.filter(d => d.status === 3).length;
  const pendingDetails = totalDetails - completedDetails;
  const allDetailsCompleted = completedDetails === totalDetails;

  // Obtener la sesión para ver su estado actual
  const session = await this.sessionRepository.findOne({
    where: { id: sessionId }
  });

  // Verificar que la sesión exista
  if (!session) {
    return {
      canUpdate: false,
      totalDetails,
      completedDetails,
      pendingDetails,
      allDetailsCompleted,
      detailsStatus: [],
      errorMessage: 'Sesión no encontrada'
    };
  }

  // Regla: Solo se puede marcar como completada (3) si todos los detalles están completados
  let canUpdate = true;
  let errorMessage = '';

  if (newSessionStatus === 3 && !allDetailsCompleted) {
    canUpdate = false;
    errorMessage = 'Todos los detalles de la sesión deben estar completados antes de marcar la sesión como completada.';
  }

  // NUEVA REGLA: Solo se puede marcar como pagada (4) si la sesión está completada (3)
  if (newSessionStatus === 4) {
    if (session.sessionStatus !== 3) {
      canUpdate = false;
      errorMessage = 'La sesión debe estar en estado "Completado" antes de marcarla como "Pagada".';
    } else if (!allDetailsCompleted) {
      canUpdate = false;
      errorMessage = 'Todos los detalles deben estar completados para marcar la sesión como pagada.';
    }
  }

  // Obtener información detallada de cada detalle
  const detailsStatus = await Promise.all(
    sessionDetails.map(async (detail) => {
      const service = await this.serviceRepository.findOne({
        where: { id: detail.serviceId }
      });

      return {
        id: detail.id,
        serviceId: detail.serviceId,
        serviceName: service?.name || 'Desconocido',
        status: detail.status,
        statusText: this.getDetailStatusText(detail.status),
        cost: detail.cost,
        totalTime: detail.totalTime
      };
    })
  );

  return {
    canUpdate,
    totalDetails,
    completedDetails,
    pendingDetails,
    allDetailsCompleted,
    detailsStatus,
    ...(errorMessage ? { errorMessage } : {})
  };
}

  // Actualizar estado de un detalle específico (privado)
  private async updateSpecificDetailStatus(
    detailId: number,
    status: number,
    adminId: number
  ): Promise<SessionDetail> {
    const detail = await this.sessionDetailRepository.findOne({
      where: { id: detailId }
    });

    if (!detail) {
      throw new NotFoundException(`Detalle con ID ${detailId} no encontrado`);
    }

    detail.status = status;

    return await this.sessionDetailRepository.save(detail);
  }

  // Obtener texto del estado del detalle
  private getDetailStatusText(status: number): string {
    const statusMap: Record<number, string> = {
      1: 'Agendado',
      2: 'En proceso',
      3: 'Completado',
   };
    return statusMap[status] || `Estado ${status}`;
  }

async getSessionDetailsWithValidation(
  sessionId: number,
  adminId: number
): Promise<{
  session: any;
  details: any[];
  statusSummary: {
    totalDetails: number;
    completedDetails: number;
    pendingDetails: number;
    allDetailsCompleted: boolean;
    canCompleteSession: boolean;
    currentSessionStatus: number;
    currentSessionStatusText: string;
  };
}> {
  // Verificar permisos
  const adminCompany = await this.companyRepository.findOne({
    where: { userId: adminId }
  });

  if (!adminCompany) {
    throw new NotFoundException('El administrador no tiene una compañía asignada');
  }

  // Buscar la sesión
  const session = await this.sessionRepository.findOne({
    where: { id: sessionId }
  });

  if (!session) {
    throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
  }

  // Obtener detalles con información relacionada
  const sessionDetails = await this.sessionDetailRepository.find({
    where: { sessionId: sessionId }
  });

  // Obtener información del cliente para enriquecer la respuesta
  const client = await this.clientRepository.findOne({
    where: { id: session.clientId }
  });

  // Enriquecer los detalles
  const enrichedDetails = await Promise.all(
    sessionDetails.map(async (detail) => {
      const companyWorker = await this.companyWorkerRepository.findOne({
        where: { id: detail.companyWorkerId },
        relations: ['worker', 'company']
      });

      const service = await this.serviceRepository.findOne({
        where: { id: detail.serviceId }
      });

      return {
        id: detail.id,
        serviceId: detail.serviceId,
        serviceName: service?.name || 'Desconocido',
        serviceDescription: service?.description || '',
        companyWorkerId: detail.companyWorkerId,
        workerName: companyWorker?.worker 
          ? `${companyWorker.worker.name || ''} ${companyWorker.worker.lastName || ''}`.trim()
          : 'Trabajador no encontrado',
        cost: detail.cost,
        totalTime: detail.totalTime,
        totalWorker: detail.totalWorker,
        totalCompany: detail.totalCompany,
        status: detail.status,
        statusText: this.getDetailStatusText(detail.status),
        startDatetime: detail.startDatetime,
        updatedAt: detail.updatedAt
      };
    })
  );

  // Calcular resumen de estados
  const totalDetails = enrichedDetails.length;
  const completedDetails = enrichedDetails.filter(d => d.status === 3).length;
  const pendingDetails = totalDetails - completedDetails;
  const allDetailsCompleted = completedDetails === totalDetails;
  const canCompleteSession = allDetailsCompleted;

  // Crear un objeto session enriquecido con información adicional
  const enrichedSession = {
    ...session,
    clientName: client ? `${client.name || ''} ${client.lastName || ''}`.trim() : 'Cliente no encontrado',
    clientLastName: client?.lastName || '',
    sessionStatusText: this.getSessionStatusText(session.sessionStatus)
  };

  return {
    session: enrichedSession,
    details: enrichedDetails,
    statusSummary: {
      totalDetails,
      completedDetails,
      pendingDetails,
      allDetailsCompleted,
      canCompleteSession,
      currentSessionStatus: session.sessionStatus,
      currentSessionStatusText: this.getSessionStatusText(session.sessionStatus)
    }
  };
}
}