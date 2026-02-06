import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
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

    console.log('📝 Datos de sesión a crear (admin):', {
      sessionDatetime: createSessionDto.sessionDatetime,
      startDatetime: sessionData.startDatetime,
      sessionData: sessionData
    });

    const session = this.sessionRepository.create(sessionData);
    return await this.sessionRepository.save(session);
  }

  /* private calculatePercentages(
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
   }*/



  private calculatePercentagesAndTime(
    service: Service,
    companyWorkerId: number
  ): {
    workerPercentage: number;
    companyPercentage: number;
    workerAssigned: boolean;
    time: number;
  } {
    let workerPercentage = 0;
    let companyPercentage = 0;
    let workerAssigned = false;
    let time = service.standardTime || 0;

    // Primero buscar si el trabajador específico tiene configuraciones en el array workers
    if (service.workers && Array.isArray(service.workers) && service.workers.length > 0) {
      const workerAssignment = service.workers.find(
        (worker: any) => worker.id === companyWorkerId
      );

      if (workerAssignment) {
        // Si el trabajador tiene porcentaje específico, usarlo
        if (workerAssignment.percentage !== undefined && workerAssignment.percentage !== null) {
          workerPercentage = workerAssignment.percentage;
          workerAssigned = true;
        }

        // Si el trabajador tiene tiempo específico, usarlo
        if (workerAssignment.time !== undefined && workerAssignment.time !== null) {
          time = workerAssignment.time;
        }
      }
    }

    // Si no se encontró asignación específica del trabajador o no tenía porcentaje,
    // usar el porcentaje general del servicio
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

    // Validaciones de porcentajes
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

    return { workerPercentage, companyPercentage, workerAssigned, time };
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
      this.validateServicePercentagesAndTime(service);
      const { workerPercentage, companyPercentage, workerAssigned, time: detailTime } = this.calculatePercentagesAndTime(
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
      // const detailTime = service.standardTime || 0;

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
      totalCost: totalSessionCost,
      totalTime: totalSessionTime,
      iaResponse: createSessionWithDetailDto.iaResponse,
      startDatetime: createSessionWithDetailDto.startDatetime || createSessionWithDetailDto.sessionDatetime || new Date(),
      status: createSessionWithDetailDto.status !== undefined ? createSessionWithDetailDto.status : 1,
    };

    console.log('📝 Creando sesión con datos:', {
      clientId: sessionData.clientId,
      sessionDatetime: sessionData.sessionDatetime,
      startDatetime: sessionData.startDatetime,
      totalCost: sessionData.totalCost,
      totalTime: sessionData.totalTime
    });


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

    // Actualizar automáticamente el estado de la sesión basado en los detalles
    try {
      await this.updateSessionStatusBasedOnDetails(session.id);
      console.log(`✅ Estado de sesión actualizado automáticamente basado en ${createdDetails.length} detalle(s)`);
    } catch (error) {
      console.warn(`⚠️ No se pudo actualizar automáticamente el estado de la sesión: ${error.message}`);
      // No lanzamos error para no romper el flujo, solo registramos advertencia
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

  /*private validateServicePercentages(service: Service): void {
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
  }*/

  private validateServicePercentagesAndTime(service: Service): void {
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

        // Validar tiempo si existe (debe ser un número positivo)
        if (worker.time !== undefined && worker.time !== null) {
          const time = Number(worker.time);
          if (time < 0) {
            throw new BadRequestException(
              `El tiempo del worker ${worker.id} en el servicio ${service.id} no es válido (${time} minutos). Debe ser un número positivo`
            );
          }
        }
      });
    }

    // Validar tiempo general del servicio
    if (service.standardTime !== undefined && service.standardTime !== null) {
      const standardTime = Number(service.standardTime);
      if (standardTime < 0) {
        throw new BadRequestException(
          `El tiempo general del servicio ${service.id} no es válido (${standardTime} minutos). Debe ser un número positivo`
        );
      }
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

  // 1. Primero, obtener los company_worker_ids de la compañía del administrador
  const companyWorkers = await this.companyWorkerRepository.find({
    where: { 
      companyId: adminCompany.id,
      isActive: 1
    },
    select: ['id']
  });

  const companyWorkerIds = companyWorkers.map(cw => cw.id);

  if (companyWorkerIds.length === 0) {
    // Si la compañía no tiene trabajadores activos, retornar lista vacía
    return {
      data: [],
      meta: {
        page: getSessionsDto.page,
        limit: getSessionsDto.limit,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      }
    };
  }

  // 2. Buscar las sesiones que tienen detalles con company_worker_id de la compañía del admin
  const sessionIdsQuery = this.sessionDetailRepository
    .createQueryBuilder('detail')
    .select('DISTINCT detail.session_id', 'sessionId')
    .where('detail.company_worker_id IN (:...companyWorkerIds)', { companyWorkerIds });

  // Aplicar filtros de fecha a los detalles si es necesario
  if (getSessionsDto.today) {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    
    sessionIdsQuery.andWhere('detail.start_datetime BETWEEN :startOfDay AND :endOfDay', {
      startOfDay,
      endOfDay
    });
  } else if (getSessionsDto.startDate && getSessionsDto.endDate) {
    sessionIdsQuery.andWhere('detail.start_datetime BETWEEN :startDate AND :endDate', {
      startDate: new Date(getSessionsDto.startDate),
      endDate: new Date(getSessionsDto.endDate)
    });
  }

  const sessionIdsResult = await sessionIdsQuery.getRawMany();
  const sessionIds = sessionIdsResult.map(result => result.sessionId);

  if (sessionIds.length === 0) {
    return {
      data: [],
      meta: {
        page: getSessionsDto.page,
        limit: getSessionsDto.limit,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      }
    };
  }

  // 3. Construir condiciones where para las sesiones
  const whereConditions: any = {
    id: In(sessionIds)
  };

  // FILTRO: Si today es true, filtramos por el día actual
  if (getSessionsDto.today) {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    whereConditions.sessionDatetime = Between(startOfDay, endOfDay);
    console.log(`📅 Filtrando por día actual: ${startOfDay} a ${endOfDay}`);
  }
  // Si no se usa el filtro today, usar los filtros de fecha normales
  else if (getSessionsDto.startDate && getSessionsDto.endDate) {
    whereConditions.sessionDatetime = Between(
      new Date(getSessionsDto.startDate),
      new Date(getSessionsDto.endDate)
    );
  }

  // FILTRO: Si onlyScheduled es true, filtramos solo por citas agendadas (sessionStatus = 1)
  if (getSessionsDto.onlyScheduled) {
    whereConditions.sessionStatus = 1;
    console.log(`📋 Filtrando solo citas agendadas (sessionStatus = 1)`);
  } else if (getSessionsDto.sessionStatus !== undefined) {
    // Si no se usa onlyScheduled pero se proporciona sessionStatus, usar ese
    whereConditions.sessionStatus = getSessionsDto.sessionStatus;
  }

  // Resto de filtros existentes
  if (getSessionsDto.clientId) {
    whereConditions.clientId = getSessionsDto.clientId;
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

  // 4. Obtener las sesiones con los filtros aplicados
  const [sessions, total] = await this.sessionRepository.findAndCount({
    where: whereConditions,
    order: order,
    skip: (getSessionsDto.page - 1) * getSessionsDto.limit,
    take: getSessionsDto.limit,
  });

  // 5. Enriquecer los datos con información completa
  const enrichedSessions = await Promise.all(
    sessions.map(async (session) => {
      // Obtener cliente
      const client = await this.clientRepository.findOne({
        where: { id: session.clientId }
      });

      // Obtener los detalles de la sesión que pertenecen a la compañía del admin
      const sessionDetails = await this.sessionDetailRepository.find({
        where: { 
          sessionId: session.id,
          companyWorkerId: In(companyWorkerIds)
        }
      });

      // Array para servicios
      const services: any[] = [];

      // Calcular totales sumando los detalles de la compañía del admin
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
        companyId: adminCompany.id,
        companyName: adminCompany.name,
        sessionDatetime: session.sessionDatetime,
        sessionStatus: session.sessionStatus,
        sessionStatusText: this.getSessionStatusText(session.sessionStatus),
        totalCost: totalCost,
        totalTime: totalTime,
        startDatetime: session.startDatetime,
        status: session.status,
        iaResponse: session.iaResponse,
        servicesCount: sessionDetails.length,
        services: services,
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
  userId: number,
  userRole?: string // Agrega el parámetro para el rol
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
  autoUpdateResult?: {
    previousStatus: number;
    newStatus: number;
    updated: boolean;
    reason: string;
  };
}> {
  console.log(`🔄 Actualizando estado del detalle ${detailId} a ${updateDetailStatusDto.status}. Usuario: ${userId}, Rol: ${userRole}`);

  // 1. Buscar el detalle
  const detail = await this.sessionDetailRepository.findOne({
    where: { id: detailId }
  });

  if (!detail) {
    throw new NotFoundException(`Detalle de sesión con ID ${detailId} no encontrado`);
  }

  // 2. Validar permisos según el rol
  if (userRole === 'adm') {
    // Para administradores: validación original
    const adminCompany = await this.companyRepository.findOne({
      where: { userId: userId }
    });

    if (!adminCompany) {
      throw new NotFoundException('El administrador no tiene una compañía asignada');
    }

    const companyWorker = await this.companyWorkerRepository.findOne({
      where: { id: detail.companyWorkerId },
      relations: ['company']
    });

    if (!companyWorker || companyWorker.company.id !== adminCompany.id) {
      throw new ForbiddenException('No tienes permiso para modificar este detalle');
    }
  } 
  else if (userRole === 'wrk') {
    // Para trabajadores: verificar que el detalle esté asignado a este trabajador
    const worker = await this.workerRepository.findOne({
      where: { userId: userId }
    });

    if (!worker) {
      throw new NotFoundException('Trabajador no encontrado');
    }

    // Buscar el companyWorker del trabajador
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: { 
        id: detail.companyWorkerId,
        workerId: worker.id 
      }
    });

    if (!companyWorker) {
      throw new ForbiddenException('No tienes permiso para modificar este detalle');
    }

    // Validar que el trabajador esté activo en la compañía
    if (companyWorker.isActive !== 1) {
      throw new BadRequestException('No estás activo en esta compañía');
    }
  }
  else {
    // Si no es ni admin ni worker
    throw new ForbiddenException('No tienes permisos para realizar esta acción');
  }

  // 3. Guardar estado anterior
  const previousStatus = detail.status;

  // 4. Validar que el nuevo estado sea válido (1-3 para detalles)
  if (updateDetailStatusDto.status < 1 || updateDetailStatusDto.status > 3) {
    throw new BadRequestException('El estado del detalle debe ser: 1 (Agendado), 2 (En proceso) o 3 (Completado)');
  }

  // 5. Validar transiciones de estado (opcional pero recomendado)
  if (previousStatus === 3 && updateDetailStatusDto.status !== 3) {
    throw new BadRequestException('No se puede revertir un detalle completado');
  }

  // 6. Actualizar el detalle
  detail.status = updateDetailStatusDto.status;
  const updatedDetail = await this.sessionDetailRepository.save(detail);

  // 7. Actualizar automáticamente el estado de la sesión
  const autoUpdateResult = await this.updateSessionStatusBasedOnDetails(detail.sessionId);

  // 8. Obtener la sesión actualizada
  const session = await this.sessionRepository.findOne({
    where: { id: detail.sessionId }
  });

  let sessionUpdated = false;
  let newSessionStatus: number | null = null;

  if (session && autoUpdateResult.updated) {
    sessionUpdated = true;
    newSessionStatus = autoUpdateResult.newStatus;
  }

  console.log(`✅ Detalle ${detailId} actualizado de ${previousStatus} a ${updateDetailStatusDto.status} por ${userRole}`);

  return {
    message: `Estado del detalle actualizado exitosamente de ${this.getDetailStatusText(previousStatus)} a ${this.getDetailStatusText(updateDetailStatusDto.status)}`,
    detail: updatedDetail,
    sessionUpdated,
    newSessionStatus,
    validation: {
      canUpdateDetail: true,
      detailPreviousStatus: previousStatus,
      sessionId: detail.sessionId
    },
    autoUpdateResult
  };
}
  /**
 * Método para actualizar automáticamente el estado de la sesión basado en los estados de sus detalles
 */
  private async updateSessionStatusBasedOnDetails(sessionId: number): Promise<{
    previousStatus: number;
    newStatus: number;
    updated: boolean;
    reason: string;
    detailsSummary: {
      total: number;
      scheduled: number;
      inProcess: number;
      completed: number;
    };
  }> {
    console.log(`🔄 Actualizando automáticamente estado de sesión ${sessionId} basado en detalles`);

    // 1. Obtener la sesión
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId }
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // 2. Obtener todos los detalles de la sesión
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId: sessionId }
    });

    if (sessionDetails.length === 0) {
      console.log(`ℹ️ Sesión ${sessionId} no tiene detalles, estado permanece igual`);
      return {
        previousStatus: session.sessionStatus,
        newStatus: session.sessionStatus,
        updated: false,
        reason: 'No hay detalles en la sesión',
        detailsSummary: {
          total: 0,
          scheduled: 0,
          inProcess: 0,
          completed: 0
        }
      };
    }

    // 3. Contar los estados de los detalles
    let scheduledCount = 0;    // 1: Agendado
    let inProcessCount = 0;    // 2: En proceso
    let completedCount = 0;    // 3: Completado
    let totalDetails = sessionDetails.length;

    for (const detail of sessionDetails) {
      const status = detail.status || 1; // Por defecto Agendado

      if (status === 1) {
        scheduledCount++;
      } else if (status === 2) {
        inProcessCount++;
      } else if (status === 3) {
        completedCount++;
      }
    }

    const allCompleted = completedCount === totalDetails;
    const anyInProcess = inProcessCount > 0;
    const anyScheduled = scheduledCount > 0;
    const anyCompleted = completedCount > 0;

    console.log(`📊 Resumen de detalles para sesión ${sessionId}:`);
    console.log(`- Total: ${totalDetails}`);
    console.log(`- Agendados: ${scheduledCount}`);
    console.log(`- En proceso: ${inProcessCount}`);
    console.log(`- Completados: ${completedCount}`);
    console.log(`- Estado actual de sesión: ${this.getSessionStatusText(session.sessionStatus)}`);

    // 4. Determinar el nuevo estado de la sesión basado en la lógica CORREGIDA
    const previousStatus = session.sessionStatus;
    let newStatus = previousStatus;
    let reason = '';

    // REGLAS DE ACTUALIZACIÓN AUTOMÁTICA CORREGIDAS:
    // 1. Si TODOS los detalles están completados (3) → Sesión COMPLETADA (3)
    if (allCompleted && totalDetails > 0) {
      newStatus = 3; // Completada
      reason = 'Todos los servicios han sido completados';
    }
    // 2. Si ALGÚN detalle está en proceso (2) Y hay detalles completados → Sesión EN PROCESO (2)
    else if (anyInProcess && anyCompleted) {
      newStatus = 2; // En proceso
      reason = 'Hay servicios en proceso y algunos completados';
    }
    // 3. Si ALGÚN detalle está en proceso (2) → Sesión EN PROCESO (2)
    else if (anyInProcess) {
      newStatus = 2; // En proceso
      reason = 'Hay servicios en proceso';
    }
    // 4. Si ALGÚN detalle está agendado (1) y hay detalles completados → Sesión EN PROCESO (2)
    else if (anyScheduled && anyCompleted) {
      newStatus = 2; // En proceso
      reason = 'Hay servicios agendados y algunos completados';
    }
    // 5. Si ALGÚN detalle está agendado (1) y NO hay en proceso → Sesión AGENDADA (1)
    else if (anyScheduled && !anyInProcess) {
      newStatus = 1; // Agendado
      reason = 'Hay servicios agendados';
    }
    // 6. Si la sesión estaba como completada (3) o pagada (4) pero no todos están completados
    else if ((previousStatus === 3 || previousStatus === 4) && !allCompleted) {
      if (anyInProcess) {
        newStatus = 2;
        reason = 'La sesión tenía estado completado/pagado pero hay servicios en proceso';
      } else if (anyScheduled) {
        newStatus = 1;
        reason = 'La sesión tenía estado completado/pagado pero hay servicios agendados';
      }
    }

    // 5. Solo actualizar si el estado cambió
    let updated = false;

    if (newStatus !== previousStatus) {
      session.sessionStatus = newStatus;
      await this.sessionRepository.save(session);
      updated = true;

      console.log(`✅ Estado de sesión ${sessionId} actualizado automáticamente: ${this.getSessionStatusText(previousStatus)} → ${this.getSessionStatusText(newStatus)}`);
      console.log(`📝 Razón: ${reason}`);
    } else {
      console.log(`ℹ️ Estado de sesión ${sessionId} permanece igual: ${this.getSessionStatusText(previousStatus)}`);
    }

    return {
      previousStatus,
      newStatus,
      updated,
      reason,
      detailsSummary: {
        total: totalDetails,
        scheduled: scheduledCount,
        inProcess: inProcessCount,
        completed: completedCount
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
    autoUpdateLogic?: {
      recommendedStatus: number;
      reason: string;
      basedOnDetails: {
        scheduled: number;
        inProcess: number;
        completed: number;
      };
    };
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

    // Contar estados para lógica automática
    const scheduledDetails = sessionDetails.filter(d => d.status === 1).length;
    const inProcessDetails = sessionDetails.filter(d => d.status === 2).length;

    // Determinar estado recomendado por lógica automática
    let recommendedStatus = 1; // Por defecto Agendado
    let reason = '';

    if (allDetailsCompleted && totalDetails > 0) {
      recommendedStatus = 3;
      reason = 'Todos los servicios completados';
    } else if (inProcessDetails > 0) {
      recommendedStatus = 2;
      reason = `${inProcessDetails} servicio(s) en proceso`;
    } else if (scheduledDetails > 0) {
      recommendedStatus = 1;
      reason = `${scheduledDetails} servicio(s) agendados`;
    }

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

    // REGLAS DE VALIDACIÓN:
    let canUpdate = true;
    let errorMessage = '';

    // 1. Solo se puede marcar como pagada (4) si la sesión está completada (3) y todos los detalles completados
    if (newSessionStatus === 4) {
      if (session.sessionStatus !== 3) {
        canUpdate = false;
        errorMessage = 'La sesión debe estar en estado "Completada" antes de marcarla como "Pagada".';
      } else if (!allDetailsCompleted) {
        canUpdate = false;
        errorMessage = 'Todos los detalles deben estar completados para marcar la sesión como pagada.';
      }
    }

    // 2. Advertencia si se intenta cambiar manualmente a un estado que no coincide con la lógica automática
    // (permitimos pero con advertencia)
    if (newSessionStatus !== 4 && newSessionStatus !== recommendedStatus) {
      console.warn(`⚠️ Intento de cambiar estado de sesión ${sessionId} a ${newSessionStatus}, pero la lógica automática recomienda ${recommendedStatus} (${reason})`);
      // No bloqueamos, pero registramos la advertencia
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
      autoUpdateLogic: {
        recommendedStatus,
        reason,
        basedOnDetails: {
          scheduled: scheduledDetails,
          inProcess: inProcessDetails,
          completed: completedDetails
        }
      },
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


  /**
 * Obtener todas las sesiones asignadas al trabajador autenticado
 * @param userId ID del usuario trabajador autenticado
 * @param getSessionsDto DTO con parámetros de filtro y paginación
 * @returns Lista paginada de sesiones asignadas al trabajador
 */
async getSessionsForAuthenticatedWorker(
  userId: number,
  getSessionsDto: GetSessionsDto
): Promise<PaginationResult<any>> {
  console.log(`📋 Obteniendo sesiones para trabajador autenticado (userId: ${userId})`);

  // 1. Buscar al trabajador por userId
  const worker = await this.workerRepository.findOne({
    where: { userId: userId }
  });

  if (!worker) {
    throw new NotFoundException('Trabajador no encontrado');
  }

  // 2. Buscar las asignaciones activas del trabajador en company_worker
  const companyWorkers = await this.companyWorkerRepository.find({
    where: {
      workerId: worker.id,
      isActive: 1
    },
    relations: ['company']
  });

  if (companyWorkers.length === 0) {
    throw new NotFoundException('No tienes asignaciones activas en ninguna compañía');
  }

  // 3. Obtener los IDs de las asignaciones de compañía
  const companyWorkerIds = companyWorkers.map(cw => cw.id);

  // 4. Crear query usando joins con las tablas relacionadas
  const query = this.sessionDetailRepository
    .createQueryBuilder('detail')
    .innerJoin('session', 'session', 'session.id = detail.session_id')
    .leftJoin('client', 'client', 'client.id = session.client_id')
    .leftJoin('service', 'service', 'service.id = detail.service_id')
    .leftJoin('company_worker', 'companyWorker', 'companyWorker.id = detail.company_worker_id')
    .leftJoin('worker', 'worker', 'worker.id = companyWorker.worker_id')
    .leftJoin('company', 'company', 'company.id = companyWorker.company_id')
    .select([
      'detail.id AS detailId',
      'detail.cost AS cost',
      'detail.total_time AS totalTime',
      'detail.total_worker AS totalWorker',
      'detail.total_company AS totalCompany',
      'detail.status AS detailStatus',
      'detail.start_datetime AS detailStartDatetime',
      'session.id AS sessionId',
      'session.client_id AS clientId',
      'session.session_datetime AS sessionDatetime',
      'session.session_status AS sessionStatus',
      'session.total_cost AS sessionTotalCost',
      'session.total_time AS sessionTotalTime',
      'session.start_datetime AS sessionStartDatetime',
      'session.status AS sessionStatusFlag',
      'session.ia_response AS iaResponse',
      'session.updated_at AS sessionUpdatedAt',
      'client.name AS clientName',
      'client.last_name AS clientLastName',
      'service.id AS serviceId',
      'service.name AS serviceName',
      'service.description AS serviceDescription',
      'companyWorker.id AS companyWorkerId',
      'company.id AS companyId',
      'company.name AS companyName',
      'worker.id AS workerId',
      'worker.name AS workerName',
      'worker.last_name AS workerLastName'
    ])
    .where('detail.company_worker_id IN (:...companyWorkerIds)', { companyWorkerIds });

  // 5. Aplicar filtros adicionales - CORRECCIÓN: Usar detail.start_datetime para filtro today
  // FILTRO: Solo citas del día actual - usando detail.start_datetime
  if (getSessionsDto.today) {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    
    query.andWhere('detail.start_datetime BETWEEN :startOfDay AND :endOfDay', {
      startOfDay,
      endOfDay
    });
    console.log(`📅 Trabajador: Filtrando por día actual en detail.start_datetime (${today.toLocaleDateString()})`);
  }
  // FILTRO: Por rango de fechas (si no se usa today) - usando detail.start_datetime
  else if (getSessionsDto.startDate && getSessionsDto.endDate) {
    query.andWhere('detail.start_datetime BETWEEN :startDate AND :endDate', {
      startDate: new Date(getSessionsDto.startDate),
      endDate: new Date(getSessionsDto.endDate)
    });
  }

  // FILTRO: Solo citas agendadas - CORRECCIÓN: Usar detail.status en lugar de session.session_status
  if (getSessionsDto.onlyScheduled) {
    query.andWhere('detail.status = :onlyScheduledStatus', {
      onlyScheduledStatus: 1
    });
    console.log(`📋 Trabajador: Filtrando solo detalles agendados (detail.status = 1)`);
  }
  // FILTRO: Por estado de sesión (si no se usa onlyScheduled)
  else if (getSessionsDto.sessionStatus !== undefined) {
    query.andWhere('session.session_status = :sessionStatus', {
      sessionStatus: getSessionsDto.sessionStatus
    });
  }

  // FILTRO: Por estado del detalle (puede usarse junto con onlyScheduled)
  if (getSessionsDto.detailStatus !== undefined) {
    query.andWhere('detail.status = :detailStatus', {
      detailStatus: getSessionsDto.detailStatus
    });
  }

  // FILTRO: Por ID de cliente
  if (getSessionsDto.clientId) {
    query.andWhere('session.client_id = :clientId', {
      clientId: getSessionsDto.clientId
    });
  }

  // FILTRO: Por ID de compañía
  if (getSessionsDto.companyId) {
    query.andWhere('company.id = :companyId', {
      companyId: getSessionsDto.companyId
    });
  }

  // Ordenar por fecha del detalle (detail.start_datetime) en lugar de la sesión
  query.orderBy('detail.start_datetime', getSessionsDto.orderBy === 'oldest' ? 'ASC' : 'DESC');

  // 6. Aplicar paginación y obtener datos
  const details = await query
    .skip((getSessionsDto.page - 1) * getSessionsDto.limit)
    .take(getSessionsDto.limit)
    .getRawMany();

  // 7. Obtener el total (sin paginación)
  const countQuery = this.sessionDetailRepository
    .createQueryBuilder('detail')
    .innerJoin('session', 'session', 'session.id = detail.session_id')
    .leftJoin('company_worker', 'companyWorker', 'companyWorker.id = detail.company_worker_id')
    .leftJoin('company', 'company', 'company.id = companyWorker.company_id')
    .where('detail.company_worker_id IN (:...companyWorkerIds)', { companyWorkerIds });

  // Aplicar los mismos filtros a la query de conteo
  if (getSessionsDto.today) {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    
    countQuery.andWhere('detail.start_datetime BETWEEN :startOfDay AND :endOfDay', {
      startOfDay,
      endOfDay
    });
  } else if (getSessionsDto.startDate && getSessionsDto.endDate) {
    countQuery.andWhere('detail.start_datetime BETWEEN :startDate AND :endDate', {
      startDate: new Date(getSessionsDto.startDate),
      endDate: new Date(getSessionsDto.endDate)
    });
  }

  // CORRECCIÓN: Para onlyScheduled, usar detail.status
  if (getSessionsDto.onlyScheduled) {
    countQuery.andWhere('detail.status = :onlyScheduledStatus', {
      onlyScheduledStatus: 1
    });
  } else if (getSessionsDto.sessionStatus !== undefined) {
    countQuery.andWhere('session.session_status = :sessionStatus', {
      sessionStatus: getSessionsDto.sessionStatus
    });
  }

  if (getSessionsDto.detailStatus !== undefined) {
    countQuery.andWhere('detail.status = :detailStatus', {
      detailStatus: getSessionsDto.detailStatus
    });
  }

  if (getSessionsDto.clientId) {
    countQuery.andWhere('session.client_id = :clientId', {
      clientId: getSessionsDto.clientId
    });
  }

  if (getSessionsDto.companyId) {
    countQuery.andWhere('company.id = :companyId', {
      companyId: getSessionsDto.companyId
    });
  }

  const total = await countQuery.getCount();

  // 8. Procesar resultados y agrupar por sesión
  const sessionMap = new Map<number, any>();

  for (const detail of details) {
    const sessionId = detail.sessionId;

    if (!sessionMap.has(sessionId)) {
      sessionMap.set(sessionId, {
        id: sessionId,
        clientId: detail.clientId,
        clientName: detail.clientName ? `${detail.clientName || ''} ${detail.clientLastName || ''}`.trim() : 'Cliente no encontrado',
        clientLastName: detail.clientLastName || '',
        sessionDatetime: detail.sessionDatetime,
        sessionStatus: detail.sessionStatus,
        sessionStatusText: this.getSessionStatusText(detail.sessionStatus),
        totalCost: parseFloat(detail.sessionTotalCost) || 0,
        totalTime: parseFloat(detail.sessionTotalTime) || 0,
        startDatetime: detail.sessionStartDatetime,
        status: detail.sessionStatusFlag,
        iaResponse: detail.iaResponse,
        createdAt: detail.sessionUpdatedAt,
        workerServices: []
      });
    }

    // Convertir todos los valores numéricos de string a número
    const cost = parseFloat(detail.cost) || 0;
    const totalTime = parseFloat(detail.totalTime) || 0;
    const totalWorker = parseFloat(detail.totalWorker) || 0;
    const totalCompany = parseFloat(detail.totalCompany) || 0;

    // Calcular porcentajes
    let workerPercentage = 0;
    let companyPercentage = 0;

    if (cost > 0) {
      workerPercentage = parseFloat(((totalWorker / cost) * 100).toFixed(2));
      companyPercentage = parseFloat(((totalCompany / cost) * 100).toFixed(2));
    }

    // Agregar el servicio específico del trabajador
    const sessionData = sessionMap.get(sessionId);
    sessionData.workerServices.push({
      detailId: detail.detailId,
      serviceId: detail.serviceId,
      serviceName: detail.serviceName || 'Servicio no encontrado',
      serviceDescription: detail.serviceDescription || '',
      cost: cost,
      totalTime: totalTime,
      totalWorker: totalWorker,
      totalCompany: totalCompany,
      detailStatus: detail.detailStatus || 1,
      detailStatusText: this.getDetailStatusText(detail.detailStatus || 1),
      startDatetime: detail.detailStartDatetime,
      companyId: detail.companyId,
      companyName: detail.companyName || 'Compañía no encontrada',
      workerPercentage: workerPercentage,
      companyPercentage: companyPercentage,
      workerName: detail.workerName,
      workerLastName: detail.workerLastName
    });
  }

  // 9. Convertir el mapa a array y calcular estadísticas
  const sessions = Array.from(sessionMap.values()).map(session => {
    // Asegurarse de que los valores sean números
    const workerTotalCost = session.workerServices.reduce((sum, service) => {
      return sum + (typeof service.cost === 'number' ? service.cost : parseFloat(service.cost) || 0);
    }, 0);

    const workerTotalTime = session.workerServices.reduce((sum, service) => {
      return sum + (typeof service.totalTime === 'number' ? service.totalTime : parseFloat(service.totalTime) || 0);
    }, 0);

    // Verificar si la sesión tiene detalles hoy
    const hasTodayDetail = session.workerServices.some(service => 
      this.isToday(service.startDatetime)
    );

    // Calcular el estado general basado en los detalles
    const allDetailsScheduled = session.workerServices.every(service => service.detailStatus === 1);
    const anyDetailInProcess = session.workerServices.some(service => service.detailStatus === 2);
    const allDetailsCompleted = session.workerServices.every(service => service.detailStatus === 3);

    let workerOverallStatus = 'Desconocido';
    if (allDetailsCompleted) {
      workerOverallStatus = 'Completado';
    } else if (anyDetailInProcess) {
      workerOverallStatus = 'En proceso';
    } else if (allDetailsScheduled) {
      workerOverallStatus = 'Agendado';
    } else if (session.workerServices.some(s => s.detailStatus === 3) && session.workerServices.some(s => s.detailStatus !== 3)) {
      workerOverallStatus = 'Parcialmente completado';
    }

    return {
      ...session,
      workerTotalCost: parseFloat(workerTotalCost.toFixed(2)),
      workerTotalTime: parseFloat(workerTotalTime.toFixed(2)),
      workerTotalServices: session.workerServices.length,
      workerOverallStatus: workerOverallStatus,
      hasTodayDetail: hasTodayDetail,
      isToday: hasTodayDetail // Para compatibilidad
    };
  });

  // 10. Si el filtro today está activo, mostrar solo sesiones con detalles hoy
  let filteredSessions = sessions;
  if (getSessionsDto.today) {
    filteredSessions = sessions.filter(session => session.hasTodayDetail);
  }

  // 11. Ordenar sesiones según el criterio
  if (getSessionsDto.orderBy === 'oldest') {
    filteredSessions.sort((a, b) => {
      // Ordenar por la fecha del primer detalle
      const aDate = a.workerServices.length > 0 ? 
        new Date(a.workerServices[0].startDatetime).getTime() : 
        new Date(a.sessionDatetime).getTime();
      const bDate = b.workerServices.length > 0 ? 
        new Date(b.workerServices[0].startDatetime).getTime() : 
        new Date(b.sessionDatetime).getTime();
      return aDate - bDate;
    });
  } else {
    filteredSessions.sort((a, b) => {
      const aDate = a.workerServices.length > 0 ? 
        new Date(a.workerServices[0].startDatetime).getTime() : 
        new Date(a.sessionDatetime).getTime();
      const bDate = b.workerServices.length > 0 ? 
        new Date(b.workerServices[0].startDatetime).getTime() : 
        new Date(b.sessionDatetime).getTime();
      return bDate - aDate;
    });
  }
  return {
    data: filteredSessions,
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

/**
 * Método auxiliar para verificar si una fecha es hoy
 */
private isToday(date: Date): boolean {
  const inputDate = new Date(date);
  const today = new Date();
  
  return inputDate.getDate() === today.getDate() &&
         inputDate.getMonth() === today.getMonth() &&
         inputDate.getFullYear() === today.getFullYear();
}

/**
 * Calcular el estado general del trabajador para una sesión basado en sus detalles
 */
private calculateWorkerOverallStatus(workerServices: any[]): string {
  if (workerServices.length === 0) return 'Sin servicios';

  const allCompleted = workerServices.every(service => service.detailStatus === 3);
  const anyInProgress = workerServices.some(service => service.detailStatus === 2);
  const anyScheduled = workerServices.some(service => service.detailStatus === 1);

  if (allCompleted) return 'Completado';
  if (anyInProgress) return 'En proceso';
  if (anyScheduled) return 'Agendado';

  return 'Desconocido';
}

  /**
   * Crear una sesión con detalles para un cliente autenticado
   * @param createSessionWithDetailDto Datos de la sesión y servicios
   * @param clientUserId ID del usuario cliente autenticado
   * @returns Resultado de la creación de la sesión
   */
  async createSessionByClient(
    createSessionWithDetailDto: CreateSessionWithDetailDto,
    clientUserId: number
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
    console.log(`👤 Cliente creando sesión (userId: ${clientUserId})`);

    // 1. Obtener el cliente a partir del userId
    const client = await this.clientRepository.findOne({
      where: { userId: clientUserId }
    });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    // 2. Validaciones iniciales - El cliente no debe enviar clientId, se usa el suyo
    if (createSessionWithDetailDto.clientId) {
      console.warn(`⚠️ Cliente intentó especificar clientId: ${createSessionWithDetailDto.clientId}. Se usará su propio ID: ${client.id}`);
    }

    // Usar el ID del cliente autenticado
    const clientId = client.id;

    if (!createSessionWithDetailDto.details || createSessionWithDetailDto.details.length === 0) {
      throw new BadRequestException('Debe proporcionar al menos un servicio');
    }

    // 3. Validar que todos los servicios sean de la misma compañía (por simplicidad)
    const companyWorkerIds = createSessionWithDetailDto.details.map(d => d.companyWorkerId);
    const uniqueCompanyWorkerIds = [...new Set(companyWorkerIds)];

    // Obtener información de los companyWorkers para validar compañías
    const companyWorkers = await this.companyWorkerRepository.find({
      where: { id: In(uniqueCompanyWorkerIds) },
      relations: ['company']
    });

    if (companyWorkers.length === 0) {
      throw new NotFoundException('No se encontraron los trabajadores especificados');
    }

    // Verificar que todos los trabajadores sean de la misma compañía
    const companyIds = companyWorkers.map(cw => cw.company?.id).filter(id => id !== undefined);
    const uniqueCompanyIds = [...new Set(companyIds)];

    if (uniqueCompanyIds.length === 0) {
      throw new BadRequestException('No se pudo determinar la compañía de los trabajadores');
    }

    if (uniqueCompanyIds.length > 1) {
      throw new BadRequestException('Todos los servicios deben ser de la misma compañía');
    }

    const companyId = uniqueCompanyIds[0];
    const company = companyWorkers[0]?.company;

    if (!company) {
      throw new NotFoundException('Compañía no encontrada');
    }

    const companyName = company.name;

    // 4. Verificar si el cliente ya tiene una cita en la misma fecha y hora
    if (createSessionWithDetailDto.sessionDatetime) {
      const existingAppointment = await this.checkIfClientHasAppointmentAtSameTime(
        clientId,
        createSessionWithDetailDto.sessionDatetime,
        companyId
      );

      if (existingAppointment) {
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
          message: `Ya tienes una cita agendada para la misma fecha y hora.`,
          details: {
            existingAppointmentId: existingAppointment.id,
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

    // 5. Definir tipo para las validaciones de servicio
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

    // 6. Calcular todos los totales y validar ANTES de crear la sesión
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
      // Los clientes pueden agendar servicios de cualquier compañía
      const service = await this.serviceRepository.findOne({
        where: { id: detail.serviceId }
      });

      if (!service) {
        throw new NotFoundException(`Servicio con ID ${detail.serviceId} no encontrado`);
      }

      // Verificar que el servicio pertenezca a la misma compañía que el trabajador
      if (service.companyId !== companyId) {
        throw new BadRequestException(
          `El servicio ${service.name} no pertenece a la compañía del trabajador seleccionado`
        );
      }

      const companyWorker = await this.companyWorkerRepository.findOne({
        where: {
          id: detail.companyWorkerId,
          companyId: companyId
        },
        relations: ['worker']
      });

      if (!companyWorker) {
        throw new NotFoundException(`Trabajador de compañía con ID ${detail.companyWorkerId} no encontrado`);
      }

      if (companyWorker.isActive !== 1) {
        throw new BadRequestException(`El trabajador de compañía con ID ${detail.companyWorkerId} no está activo`);
      }

      // Validar porcentajes del servicio
      this.validateServicePercentagesAndTime(service);
      const { workerPercentage, companyPercentage, workerAssigned, time: detailTime } = this.calculatePercentagesAndTime(
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

      const detailCost = calculatedAmounts.cost;
      totalSessionCost += detailCost;
      totalSessionTime += detailTime;

      const workerName = companyWorker.worker
        ? `${companyWorker.worker.name || ''} ${companyWorker.worker.lastName || ''}`.trim()
        : `Trabajador ID: ${companyWorker.id}`;

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

    // 7. Crear datos de la sesión con los totales calculados
    const sessionData: CreateSessionDto = {
      clientId: clientId, // Usar el ID del cliente autenticado
      sessionDatetime: createSessionWithDetailDto.sessionDatetime,
      sessionStatus: createSessionWithDetailDto.sessionStatus !== undefined ? createSessionWithDetailDto.sessionStatus : 1,
      totalCost: totalSessionCost,
      totalTime: totalSessionTime,
      iaResponse: createSessionWithDetailDto.iaResponse,
      startDatetime: createSessionWithDetailDto.startDatetime || createSessionWithDetailDto.sessionDatetime || new Date(),
      status: createSessionWithDetailDto.status !== undefined ? createSessionWithDetailDto.status : 1,
    };

    console.log('📝 Cliente creando sesión con datos:', {
      clientId: sessionData.clientId,
      sessionDatetime: sessionData.sessionDatetime,
      startDatetime: sessionData.startDatetime,
      totalCost: sessionData.totalCost,
      totalTime: sessionData.totalTime
    });


    // 8. Verificar si ya existe una sesión con los mismos datos
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
          message: `Ya tienes una sesión con los mismos datos y todos los servicios ya están asignados.`,
          existingSession,
          existingDetails,
          recommendation: 'Si desea modificar la sesión existente, use el endpoint de actualización.'
        });
      }

      return {
        message: `Ya tienes una sesión con los mismos datos (ID: ${existingSession.id}). Para agregar nuevos servicios, debe crear una nueva sesión con datos diferentes.`,
        isNew: false,
        wasAlreadyAssociated: false,
        clientId: clientId,
        companyId: companyId,
        companiesBefore: [],
        companiesAfter: [],
        existingSession: existingSession
      };
    }

    // 9. Crear la sesión - usar el método create sin adminId para clientes
    const session = await this.createSessionForClient(sessionData);
    const isNew = true;
    const createdDetails: SessionDetail[] = [];

    // Actualizar automáticamente el estado de la sesión basado en los detalles
    try {
      await this.updateSessionStatusBasedOnDetails(session.id);
      console.log(`✅ Estado de sesión del cliente actualizado automáticamente basado en ${createdDetails.length} detalle(s)`);
    } catch (error) {
      console.warn(`⚠️ No se pudo actualizar automáticamente el estado de la sesión del cliente: ${error.message}`);
    }

    // 10. Crear los detalles de sesión
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
          clientId,
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

    // 11. Verificar y actualizar las compañías del cliente
    let wasAlreadyAssociated = false;
    let companiesBefore: number[] = [];
    let companiesAfter: number[] = [];

    companiesBefore = client.companies || [];
    const targetCompanyId = Number(companyId);

    if (!companiesBefore.includes(targetCompanyId)) {
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

    // 12. Construir mensaje de éxito
    let message: string;

    if (wasAlreadyAssociated) {
      message = `Cita creada exitosamente con ${createdDetails.length} servicio(s). Ya estabas asociado a ${companyName}.`;
    } else {
      message = `Cita creada exitosamente con ${createdDetails.length} servicio(s). Has sido asociado a ${companyName}.`;
    }

    // 13. Mostrar resumen en consola
    console.log('📊 RESUMEN DE CREACIÓN DE CITA POR CLIENTE:');
    console.log(`- Sesión ID: ${session.id}`);
    console.log(`- Cliente ID: ${clientId}`);
    console.log(`- Total Costo: $${totalSessionCost}`);
    console.log(`- Total Tiempo: ${totalSessionTime} minutos`);
    console.log(`- Servicios creados: ${createdDetails.length}`);
    console.log(`- Compañía: ${companyName} (ID: ${companyId})`);
    console.log(`- Trabajadores: ${uniqueCompanyWorkerIds.length}`);

    return {
      message,
      isNew,
      wasAlreadyAssociated,
      clientId,
      companyId,
      companiesBefore,
      companiesAfter,
      calculations,
      createdDetails
    };
  }

  /**
   * Método para crear sesión sin validación de administrador (para clientes)
   */
  async createSessionForClient(createSessionDto: CreateSessionDto): Promise<Session> {
    const existingSession = await this.checkExistingSession(createSessionDto);

    if (existingSession) {
      throw new BadRequestException({
        message: 'Ya existe una cita con los mismos datos',
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

    console.log('📝 Datos de sesión a crear (cliente):', {
      sessionDatetime: createSessionDto.sessionDatetime,
      startDatetime: sessionData.startDatetime,
      sessionData: sessionData
    });

    const session = this.sessionRepository.create(sessionData);
    return await this.sessionRepository.save(session);
  }
  // En el SessionService
  async syncSessionStatusFromDetails(
    sessionId: number,
    adminId: number
  ): Promise<{
    message: string;
    session: Session;
    syncResult: {
      previousStatus: number;
      newStatus: number;
      updated: boolean;
      reason: string;
    };
    detailsSummary: {
      total: number;
      scheduled: number;
      inProcess: number;
      completed: number;
    };
  }> {
    console.log(`🔄 Sincronizando estado de sesión ${sessionId} desde detalles`);

    // 1. Verificar permisos
    const adminCompany = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!adminCompany) {
      throw new NotFoundException('El administrador no tiene una compañía asignada');
    }

    // 2. Verificar que la sesión pertenezca a la compañía del administrador
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId }
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId: sessionId }
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
      throw new ForbiddenException('No tienes permiso para modificar esta sesión');
    }

    // 3. Actualizar el estado basado en detalles
    const syncResult = await this.updateSessionStatusBasedOnDetails(sessionId);

    // 4. Obtener estadísticas de detalles
    const sessionDetailsUpdated = await this.sessionDetailRepository.find({
      where: { sessionId: sessionId }
    });

    const detailsSummary = {
      total: sessionDetailsUpdated.length,
      scheduled: sessionDetailsUpdated.filter(d => d.status === 1).length,
      inProcess: sessionDetailsUpdated.filter(d => d.status === 2).length,
      completed: sessionDetailsUpdated.filter(d => d.status === 3).length,
    };

    // 5. Obtener la sesión actualizada
    const updatedSession = await this.sessionRepository.findOne({
      where: { id: sessionId }
    });

    if (!updatedSession) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada después de la sincronización`);
    }

    return {
      message: syncResult.updated
        ? `Estado de sesión sincronizado: ${this.getSessionStatusText(syncResult.previousStatus)} → ${this.getSessionStatusText(syncResult.newStatus)}`
        : `Estado de sesión ya está sincronizado: ${this.getSessionStatusText(syncResult.previousStatus)}`,
      session: updatedSession,
      syncResult,
      detailsSummary
    };
  }

}