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
import { AddExtraServicesDto, ExtraServiceItemDto } from './dto/add-extra-services.dto';
import { CancelSessionDto } from './dto/cancel-session.dto';
import { IAPromptsService } from '../IAprompts/ia_prompts.service'; 
import { Offer } from 'src/Offer/entities/offer.entity';
import { ServiceOffer } from 'src/Offer/entities/service-offer.entity';

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
    private iaPromptsService: IAPromptsService,
     @InjectRepository(Offer)
    private offerRepository: Repository<Offer>,
    @InjectRepository(ServiceOffer)
    private serviceOfferRepository: Repository<ServiceOffer>,

  ) { }


   /**
   * Busca la oferta activa (más barata) para un servicio en una compañía.
   * Retorna el precio de oferta o null si no hay ninguna activa hoy.
   */
  private async getActiveOfferForService(
    serviceId: number,
    companyId: number
  ): Promise<{ price: number; offerId: number; offerName: string } | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const serviceOffer = await this.serviceOfferRepository
      .createQueryBuilder('so')
      .innerJoinAndSelect('so.offer', 'offer')
      .where('so.serviceId = :serviceId', { serviceId })
      .andWhere('offer.companyId = :companyId', { companyId })
      .andWhere('offer.status = :status', { status: 1 })
      .andWhere('offer.startDate <= :today', { today })
      .andWhere('offer.endDate >= :today', { today })
      .orderBy('so.price', 'ASC')
      .getOne();

    if (!serviceOffer) return null;

    return {
      price: Number(serviceOffer.price),
      offerId: serviceOffer.offerId,
      offerName: (serviceOffer as any).offer?.name || '',
    };
  }


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
     // description: session.description,
      //descriptionIA: session.descriptionIA,
      details: details, // Incluir todos los detalles

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

    // 1. Obtener los company_worker_ids de la compañía
    const companyWorkers = await this.companyWorkerRepository.find({
      where: {
        companyId: adminCompany.id,
        isActive: 1
      },
      select: ['id']
    });

    const companyWorkerIds = companyWorkers.map(cw => cw.id);

    if (companyWorkerIds.length === 0) {
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

    // 2. Buscar sessionIds que tienen detalles con estos company_worker_ids
    const sessionIdsQuery = this.sessionDetailRepository
      .createQueryBuilder('detail')
      .select('DISTINCT detail.session_id', 'sessionId')
      .where('detail.company_worker_id IN (:...companyWorkerIds)', { companyWorkerIds });

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

    // ===================================================================
    // FILTROS DE FECHA
    // ===================================================================

    // PRIORIDAD 1: Filtrar por un día específico
    if (getSessionsDto.date) {
      // Parsear la fecha correctamente (solo YYYY-MM-DD del string)
      const dateStr = getSessionsDto.date.split('T')[0].split(' ')[0]; // Obtener solo la parte de fecha
      const [year, month, day] = dateStr.split('-').map(Number);

      // Crear fechas en zona horaria local
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      whereConditions.sessionDatetime = Between(startOfDay, endOfDay);
      console.log(`📅 Filtrando por fecha específica: ${dateStr} (${startOfDay.toISOString()} - ${endOfDay.toISOString()})`);
    }
    // PRIORIDAD 2: Filtrar por día de hoy
    else if (getSessionsDto.today) {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

      whereConditions.sessionDatetime = Between(startOfDay, endOfDay);
      console.log(`📅 Filtrando por día actual: ${startOfDay.toLocaleDateString()}`);
    }
    // PRIORIDAD 3: Filtrar por rango de fechas
    else if (getSessionsDto.startDate && getSessionsDto.endDate) {
      const startDateStr = getSessionsDto.startDate.split('T')[0].split(' ')[0];
      const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
      const startOfDay = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

      const endDateStr = getSessionsDto.endDate.split('T')[0].split(' ')[0];
      const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
      const endOfDay = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

      whereConditions.sessionDatetime = Between(startOfDay, endOfDay);
      console.log(`📅 Filtrando por rango: ${startDateStr} - ${endDateStr}`);
    }

    // ===================================================================
    // FILTROS DE ESTADO
    // ===================================================================

    if (getSessionsDto.onlyScheduled) {
      whereConditions.sessionStatus = 1;
      console.log(`📋 Filtrando solo citas agendadas (sessionStatus = 1)`);
    } else if (getSessionsDto.sessionStatus !== undefined) {
      whereConditions.sessionStatus = getSessionsDto.sessionStatus;
    }

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

    // 4. Obtener las sesiones con filtros aplicados
    const [sessions, total] = await this.sessionRepository.findAndCount({
      where: whereConditions,
      order: order,
      skip: (getSessionsDto.page - 1) * getSessionsDto.limit,
      take: getSessionsDto.limit,
    });

    // 5. Enriquecer los datos (resto del código permanece igual)
    const enrichedSessions = await Promise.all(
      sessions.map(async (session) => {
        const client = await this.clientRepository.findOne({
          where: { id: session.clientId }
        });

        const sessionDetails = await this.sessionDetailRepository.find({
          where: {
            sessionId: session.id,
            companyWorkerId: In(companyWorkerIds)
          }
        });

        const services: any[] = [];
        let totalCost = 0;
        let totalTime = 0;

        if (sessionDetails.length > 0) {
          for (const detail of sessionDetails) {
            const companyWorker = await this.companyWorkerRepository.findOne({
              where: { id: detail.companyWorkerId },
              relations: ['worker', 'company']
            });

            const service = await this.serviceRepository.findOne({
              where: { id: detail.serviceId }
            });

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
          updatedAt: session['updatedAt'] || null,
       //   description: session.description,
        //  descriptionIA: session.descriptionIA,
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
      5: 'Cancelada',

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
      4: 'Cancelado',

    };
    return statusMap[status] || `Estado ${status}`;
  }

  /**
   * Obtiene los detalles de una sesión con validación de permisos según el rol del usuario.
   * 
   * @param sessionId ID de la sesión
   * @param userId ID del usuario autenticado
   * @param userRole Rol del usuario ('adm', 'wrk', 'cli')
   * @returns Sesión enriquecida, detalles y resumen de estados
   */
  async getSessionDetailsWithValidation(
    sessionId: number,
    userId: number,
    userRole: 'adm' | 'wrk' | 'cli'
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
    this.logger.log(`🔍 Obteniendo detalles de sesión ${sessionId} para usuario ${userId} (rol: ${userRole})`);

    // 1. Buscar la sesión
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId }
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // 2. Validar permisos según el rol
    if (userRole === 'adm') {
      // Admin: debe pertenecer a la compañía que posee la sesión
      const adminCompany = await this.companyRepository.findOne({
        where: { userId }
      });
      if (!adminCompany) {
        throw new NotFoundException('El administrador no tiene una compañía asignada');
      }

      const sessionDetails = await this.sessionDetailRepository.find({
        where: { sessionId }
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
        throw new ForbiddenException('No tienes permiso para ver los detalles de esta sesión');
      }
    } else if (userRole === 'wrk') {
      // Trabajador: debe tener al menos un servicio asignado en esta sesión
      const worker = await this.workerRepository.findOne({
        where: { userId }
      });
      if (!worker) {
        throw new NotFoundException('Trabajador no encontrado');
      }

      const companyWorkers = await this.companyWorkerRepository.find({
        where: {
          workerId: worker.id,
          isActive: 1
        }
      });

      if (companyWorkers.length === 0) {
        throw new ForbiddenException('No estás activo en ninguna compañía');
      }

      const companyWorkerIds = companyWorkers.map(cw => cw.id);

      const assignedDetail = await this.sessionDetailRepository.findOne({
        where: {
          sessionId,
          companyWorkerId: In(companyWorkerIds)
        }
      });

      if (!assignedDetail) {
        throw new ForbiddenException('No tienes servicios asignados en esta sesión');
      }
    } else if (userRole === 'cli') {
      // Cliente: debe ser el dueño de la sesión
      const client = await this.clientRepository.findOne({
        where: { userId }
      });
      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }
      if (session.clientId !== client.id) {
        throw new ForbiddenException('No puedes ver los detalles de una cita que no te pertenece');
      }
    } else {
      throw new ForbiddenException('Rol de usuario no válido');
    }

    // 3. Obtener información del cliente para enriquecer la respuesta
    const client = await this.clientRepository.findOne({
      where: { id: session.clientId }
    });

    // 4. Obtener todos los detalles de la sesión
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId }
    });

    // 5. Enriquecer los detalles con información de servicios y trabajadores
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

    // 6. Calcular resumen de estados
    const totalDetails = enrichedDetails.length;
    const completedDetails = enrichedDetails.filter(d => d.status === 3).length;
    const pendingDetails = totalDetails - completedDetails;
    const allDetailsCompleted = completedDetails === totalDetails;
    const canCompleteSession = allDetailsCompleted; // Solo se puede completar si todos los detalles están completados

    // 7. Sesión enriquecida con datos del cliente
    const enrichedSession = {
      ...session,
      clientName: client ? `${client.name || ''} ${client.lastName || ''}`.trim() : 'Cliente no encontrado',
      clientLastName: client?.lastName || '',
      sessionStatusText: this.getSessionStatusText(session.sessionStatus),
     // description: session.description,
    //  descriptionIA: session.descriptionIA,
      extraServices: session.extraServices,
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
   * Obtener todas las sesiones (citas) asignadas al trabajador autenticado.
   * Cada sesión incluye los datos de la cita y, dentro de 'assignedServices',
   * los detalles de los servicios que este trabajador debe realizar en ella.
   *
   * Los filtros de fecha (date, today, startDate/endDate) se aplican sobre
   * session.session_datetime (la fecha de la cita), no sobre el detalle.
   *
   * @param userId ID del usuario trabajador autenticado
   * @param getSessionsDto DTO con parámetros de filtro y paginación
   * @returns Lista paginada de sesiones con los servicios asignados al trabajador
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

    const companyWorkerIds = companyWorkers.map(cw => cw.id);

    // ---------------------------------------------------------------------
    // CONSULTA PRINCIPAL: Obtener los detalles (con paginación aplicada)
    // ---------------------------------------------------------------------
    const query = this.sessionDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('session', 'session', 'session.id = detail.session_id')
      .leftJoin('client', 'client', 'client.id = session.client_id')
      .leftJoin('service', 'service', 'service.id = detail.service_id')
      .leftJoin('company_worker', 'companyWorker', 'companyWorker.id = detail.company_worker_id')
      .leftJoin('worker', 'worker', 'worker.id = companyWorker.worker_id')
      .leftJoin('company', 'company', 'company.id = companyWorker.company_id')
      .select([
        // Campos de la sesión (cita)
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
        'session.description_worker AS descriptionWorker',
        'session.description_ia AS descriptionIA',
        'session.description AS description',
        'session.extra_services AS extraServices',

        // Campos del cliente
        'client.name AS clientName',
        'client.last_name AS clientLastName',

        // Campos del detalle (servicio asignado al trabajador)
        'detail.id AS detailId',
        'detail.cost AS cost',
        'detail.total_time AS totalTime',
        'detail.total_worker AS totalWorker',
        'detail.total_company AS totalCompany',
        'detail.status AS detailStatus',
        'detail.start_datetime AS detailStartDatetime',
        'detail.is_extra AS isExtra',

        // Campos del servicio
        'service.id AS serviceId',
        'service.name AS serviceName',
        'service.description AS serviceDescription',

        // Campos del trabajador / compañía
        'companyWorker.id AS companyWorkerId',
        'company.id AS companyId',
        'company.name AS companyName',
        'worker.id AS workerId',
        'worker.name AS workerName',
        'worker.last_name AS workerLastName'
      ])
      .where('detail.company_worker_id IN (:...companyWorkerIds)', { companyWorkerIds });

    // =========================================================================
    // FILTROS DE FECHA - AHORA SE APLICAN SOBRE session.session_datetime
    // =========================================================================

    // PRIORIDAD 1: Filtrar por una fecha específica (date)
    if (getSessionsDto.date) {
      const dateStr = getSessionsDto.date.split('T')[0].split(' ')[0];
      const [year, month, day] = dateStr.split('-').map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      query.andWhere('session.session_datetime BETWEEN :startOfDay AND :endOfDay', {
        startOfDay,
        endOfDay
      });
      console.log(`📅 Trabajador: Filtrando por fecha específica en session_datetime: ${dateStr}`);
    }
    // PRIORIDAD 2: Filtrar por día actual (today)
    else if (getSessionsDto.today) {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

      query.andWhere('session.session_datetime BETWEEN :startOfDay AND :endOfDay', {
        startOfDay,
        endOfDay
      });
      console.log(`📅 Trabajador: Filtrando por día actual en session_datetime (${today.toLocaleDateString()})`);
    }
    // PRIORIDAD 3: Filtrar por rango de fechas
    else if (getSessionsDto.startDate && getSessionsDto.endDate) {
      query.andWhere('session.session_datetime BETWEEN :startDate AND :endDate', {
        startDate: new Date(getSessionsDto.startDate),
        endDate: new Date(getSessionsDto.endDate)
      });
    }

    // FILTRO: Solo servicios agendados (detail.status = 1)
    if (getSessionsDto.onlyScheduled) {
      query.andWhere('detail.status = :onlyScheduledStatus', { onlyScheduledStatus: 1 });
      console.log(`📋 Trabajador: Filtrando solo servicios agendados (detail.status = 1)`);
    }
    // FILTRO: Por estado de sesión
    else if (getSessionsDto.sessionStatus !== undefined) {
      query.andWhere('session.session_status = :sessionStatus', {
        sessionStatus: getSessionsDto.sessionStatus
      });
    }

    // FILTRO: Por estado del detalle (independiente)
    if (getSessionsDto.detailStatus !== undefined) {
      query.andWhere('detail.status = :detailStatus', {
        detailStatus: getSessionsDto.detailStatus
      });
    }

    // FILTRO: Por ID de cliente
    if (getSessionsDto.clientId) {
      query.andWhere('session.client_id = :clientId', { clientId: getSessionsDto.clientId });
    }

    // FILTRO: Por ID de compañía
    if (getSessionsDto.companyId) {
      query.andWhere('company.id = :companyId', { companyId: getSessionsDto.companyId });
    }

    // Ordenar por fecha del detalle (detail.start_datetime)
    query.orderBy('detail.start_datetime', getSessionsDto.orderBy === 'oldest' ? 'ASC' : 'DESC');

    // Aplicar paginación (sobre los detalles)
    const details = await query
      .skip((getSessionsDto.page - 1) * getSessionsDto.limit)
      .take(getSessionsDto.limit)
      .getRawMany();

    // ---------------------------------------------------------------------
    // CONSULTA DE CONTEO: Obtener el número TOTAL de SESIONES distintas
    // (sin paginación) que cumplen los mismos filtros.
    // ---------------------------------------------------------------------
    const countQuery = this.sessionDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('session', 'session', 'session.id = detail.session_id')
      .leftJoin('company_worker', 'companyWorker', 'companyWorker.id = detail.company_worker_id')
      .leftJoin('company', 'company', 'company.id = companyWorker.company_id')
      .where('detail.company_worker_id IN (:...companyWorkerIds)', { companyWorkerIds });

    // Replicar los mismos filtros de fecha sobre session.session_datetime
    if (getSessionsDto.date) {
      const dateStr = getSessionsDto.date.split('T')[0].split(' ')[0];
      const [year, month, day] = dateStr.split('-').map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      countQuery.andWhere('session.session_datetime BETWEEN :startOfDay AND :endOfDay', { startOfDay, endOfDay });
    } else if (getSessionsDto.today) {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      countQuery.andWhere('session.session_datetime BETWEEN :startOfDay AND :endOfDay', { startOfDay, endOfDay });
    } else if (getSessionsDto.startDate && getSessionsDto.endDate) {
      countQuery.andWhere('session.session_datetime BETWEEN :startDate AND :endDate', {
        startDate: new Date(getSessionsDto.startDate),
        endDate: new Date(getSessionsDto.endDate)
      });
    }

    // Replicar el resto de filtros
    if (getSessionsDto.onlyScheduled) {
      countQuery.andWhere('detail.status = :onlyScheduledStatus', { onlyScheduledStatus: 1 });
    } else if (getSessionsDto.sessionStatus !== undefined) {
      countQuery.andWhere('session.session_status = :sessionStatus', { sessionStatus: getSessionsDto.sessionStatus });
    }

    if (getSessionsDto.detailStatus !== undefined) {
      countQuery.andWhere('detail.status = :detailStatus', { detailStatus: getSessionsDto.detailStatus });
    }

    if (getSessionsDto.clientId) {
      countQuery.andWhere('session.client_id = :clientId', { clientId: getSessionsDto.clientId });
    }

    if (getSessionsDto.companyId) {
      countQuery.andWhere('company.id = :companyId', { companyId: getSessionsDto.companyId });
    }

    // --- CONTAR SESIONES DISTINTAS ---
    const countResult = await countQuery
      .select('COUNT(DISTINCT session.id)', 'total')
      .getRawOne();

    const total = parseInt(countResult?.total || '0', 10);

    // ---------------------------------------------------------------------
    // AGRUPAR POR SESIÓN
    // ---------------------------------------------------------------------
    const sessionMap = new Map<number, any>();

    for (const detail of details) {
      const sessionId = detail.sessionId;

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          // === DATOS DE LA SESIÓN (CITA) ===
          id: sessionId,
          clientId: detail.clientId,
          clientName: detail.clientName ? `${detail.clientName || ''} ${detail.clientLastName || ''}`.trim() : 'Cliente no encontrado',
          clientLastName: detail.clientLastName || '',
          sessionDatetime: detail.sessionDatetime,
          sessionStatus: detail.sessionStatus,
          sessionStatusText: this.getSessionStatusText(detail.sessionStatus),
          sessionTotalCost: parseFloat(detail.sessionTotalCost) || 0,
          sessionTotalTime: parseFloat(detail.sessionTotalTime) || 0,
          startDatetime: detail.sessionStartDatetime,
          status: detail.sessionStatusFlag,
          iaResponse: detail.iaResponse,
          descriptionWorker: detail.descriptionWorker,
          descriptionIA: detail.descriptionIA,
          description: detail.description,
          extraServices: detail.extraServices,
          createdAt: detail.sessionUpdatedAt,
          // === SERVICIOS ASIGNADOS A ESTE TRABAJADOR ===
          assignedServices: [],
          assignedTotalCost: 0,
          assignedTotalTime: 0,
          assignedServicesCount: 0,
          assignedOverallStatus: null,
          hasAssignedTodayDetail: false
        });
      }

      const sessionData = sessionMap.get(sessionId);

      const cost = parseFloat(detail.cost) || 0;
      const totalTime = parseFloat(detail.totalTime) || 0;
      const totalWorker = parseFloat(detail.totalWorker) || 0;
      const totalCompany = parseFloat(detail.totalCompany) || 0;

      let workerPercentage = 0;
      let companyPercentage = 0;
      if (cost > 0) {
        workerPercentage = parseFloat(((totalWorker / cost) * 100).toFixed(2));
        companyPercentage = parseFloat(((totalCompany / cost) * 100).toFixed(2));
      }

      sessionData.assignedServices.push({
        detailId: detail.detailId,
        serviceId: detail.serviceId,
        serviceName: detail.serviceName || 'Servicio no encontrado',
        serviceDescription: detail.serviceDescription || '',
        cost,
        totalTime,
        totalWorker,
        totalCompany,
        detailStatus: detail.detailStatus || 1,
        detailStatusText: this.getDetailStatusText(detail.detailStatus || 1),
        startDatetime: detail.detailStartDatetime,
        isExtra: detail.isExtra === true || detail.isExtra === 1,
        companyId: detail.companyId,
        companyName: detail.companyName || 'Compañía no encontrada',
        workerPercentage,
        companyPercentage,
        workerName: detail.workerName,
        workerLastName: detail.workerLastName
      });

      sessionData.assignedTotalCost += cost;
      sessionData.assignedTotalTime += totalTime;
      sessionData.assignedServicesCount += 1;
    }

    // ---------------------------------------------------------------------
    // CALCULAR ESTADO CONSOLIDADO DEL TRABAJADOR POR SESIÓN
    // ---------------------------------------------------------------------
    const sessions = Array.from(sessionMap.values()).map(session => {
      const allScheduled = session.assignedServices.every(s => s.detailStatus === 1);
      const anyInProcess = session.assignedServices.some(s => s.detailStatus === 2);
      const allCompleted = session.assignedServices.every(s => s.detailStatus === 3);

      let overallStatus = 'Desconocido';
      if (allCompleted) overallStatus = 'Completado';
      else if (anyInProcess) overallStatus = 'En proceso';
      else if (allScheduled) overallStatus = 'Agendado';
      else if (session.assignedServices.some(s => s.detailStatus === 3) &&
        session.assignedServices.some(s => s.detailStatus !== 3)) {
        overallStatus = 'Parcialmente completado';
      }

      const hasAssignedToday = session.assignedServices.some(s =>
        this.isToday(s.startDatetime)
      );

      return {
        ...session,
        assignedTotalCost: parseFloat(session.assignedTotalCost.toFixed(2)),
        assignedTotalTime: parseFloat(session.assignedTotalTime.toFixed(2)),
        assignedOverallStatus: overallStatus,
        hasAssignedTodayDetail: hasAssignedToday
      };
    });

    // ---------------------------------------------------------------------
    // FILTRAR POR 'today' SI ES NECESARIO (ya aplicado en la consulta, pero se deja por si acaso)
    // ---------------------------------------------------------------------
    let filteredSessions = sessions;
    if (getSessionsDto.today) {
      // Aunque ya filtramos en la BD, podemos dejarlo como respaldo
      filteredSessions = sessions.filter(s => this.isToday(s.sessionDatetime));
    }

    // ---------------------------------------------------------------------
    // ORDENAR SESIONES
    // ---------------------------------------------------------------------
    if (getSessionsDto.orderBy === 'oldest') {
      filteredSessions.sort((a, b) => {
        const aDate = a.assignedServices.length > 0
          ? new Date(a.assignedServices[0].startDatetime).getTime()
          : new Date(a.sessionDatetime).getTime();
        const bDate = b.assignedServices.length > 0
          ? new Date(b.assignedServices[0].startDatetime).getTime()
          : new Date(b.sessionDatetime).getTime();
        return aDate - bDate;
      });
    } else {
      filteredSessions.sort((a, b) => {
        const aDate = a.assignedServices.length > 0
          ? new Date(a.assignedServices[0].startDatetime).getTime()
          : new Date(a.sessionDatetime).getTime();
        const bDate = b.assignedServices.length > 0
          ? new Date(b.assignedServices[0].startDatetime).getTime()
          : new Date(b.sessionDatetime).getTime();
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
      description: createSessionWithDetailDto.description,
      descriptionIA: createSessionWithDetailDto.descriptionIA
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


  // VERSIÓN ACTUALIZADA DEL MÉTODO addExtraServicesToSession
  // Este método debe REEMPLAZAR el anterior en session.service.ts

  async addExtraServicesToSession(
    sessionId: number,
    addExtraServicesDto: AddExtraServicesDto,
    adminId: number
  ): Promise<{
    message: string;
    session: Session;
    addedDetails: SessionDetail[];
    calculations: Array<{
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
      priceOption: string;
      isExtra: boolean;
      configSource: string; // NUEVO: Indica de dónde salió la configuración
    }>;
    previousTotals: {
      totalCost: number;
      totalTime: number;
    };
    newTotals: {
      totalCost: number;
      totalTime: number;
    };
  }> {
    console.log(`🎁 Agregando servicios extras a sesión ${sessionId}`);

    // 1. Verificar permisos del administrador
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
      throw new NotFoundException(`La sesión ${sessionId} no tiene detalles`);
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

    // 4. Validar que haya servicios extras para agregar
    if (!addExtraServicesDto.extraServices || addExtraServicesDto.extraServices.length === 0) {
      throw new BadRequestException('Debe proporcionar al menos un servicio extra');
    }

    // 5. Guardar totales anteriores
    const previousTotalCost = Number(session.totalCost || 0);
    const previousTotalTime = Number(session.totalTime || 0);

    // 6. Preparar validaciones y cálculos
    type ExtraServiceValidationType = {
      extraService: ExtraServiceItemDto;
      service: Service;
      companyWorker: CompanyWorker;
      workerPercentage: number;
      companyPercentage: number;
      workerAssigned: boolean;
      finalPrice: number;
      calculatedAmounts: {
        cost: number;
        totalWorker: number;
        totalCompany: number;
        calculationDetails: string;
      };
      workerName: string;
      detailTime: number;
      startDatetime: Date;
      configSource: string; // De dónde viene la configuración
    };

    const validations: ExtraServiceValidationType[] = [];
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
      priceOption: string;
      isExtra: boolean;
      configSource: string;
    }> = [];

    let extraTotalCost = 0;
    let extraTotalTime = 0;

    // 7. Pre-validar y calcular todos los servicios extras
    for (const extraService of addExtraServicesDto.extraServices) {
      // Validar que el servicio exista
      const service = await this.serviceRepository.findOne({
        where: {
          id: extraService.serviceId,
          companyId: adminCompany.id
        }
      });

      if (!service) {
        throw new NotFoundException(
          `Servicio con ID ${extraService.serviceId} no encontrado o no pertenece a tu compañía`
        );
      }

      // Validar que el trabajador (providerId = companyWorkerId) exista y esté activo
      const companyWorker = await this.companyWorkerRepository.findOne({
        where: {
          id: extraService.providerId,
          companyId: adminCompany.id
        },
        relations: ['worker']
      });

      if (!companyWorker) {
        throw new NotFoundException(
          `Trabajador con ID ${extraService.providerId} no encontrado o no pertenece a tu compañía`
        );
      }

      if (companyWorker.isActive !== 1) {
        throw new BadRequestException(
          `El trabajador con ID ${extraService.providerId} no está activo`
        );
      }

      // ========================================================================
      // PRIORIDAD 1: Buscar configuración específica en service.workers[]
      // ========================================================================
      console.log(`🔍 Buscando configuración para trabajador ${extraService.providerId} en servicio ${service.id}`);
      console.log(`📋 Array workers del servicio:`, service.workers);

      let workerPercentage = 0;
      let companyPercentage = 0;
      let detailTime = service.standardTime || 0;
      let configSource = '';
      let workerAssigned = false;

      // Buscar en el array workers del servicio
      if (service.workers && Array.isArray(service.workers) && service.workers.length > 0) {
        const workerConfig = service.workers.find(
          (w: any) => w.id === extraService.providerId
        );

        if (workerConfig) {
          console.log(`✅ Encontrada configuración específica para trabajador ${extraService.providerId}:`, workerConfig);

          // PRIORIDAD: Usar porcentaje del worker si existe
          if (workerConfig.percentage !== undefined && workerConfig.percentage !== null) {
            workerPercentage = Number(workerConfig.percentage);
            workerAssigned = true;
            configSource = 'workers_array_percentage';
            console.log(`📊 Usando porcentaje de workers[]: ${workerPercentage}%`);
          }

          // PRIORIDAD: Usar tiempo del worker si existe
          if (workerConfig.time !== undefined && workerConfig.time !== null) {
            detailTime = Number(workerConfig.time);
            configSource = configSource ? `${configSource}, workers_array_time` : 'workers_array_time';
            console.log(`⏱️  Usando tiempo de workers[]: ${detailTime} minutos`);
          }
        } else {
          console.log(`⚠️  Trabajador ${extraService.providerId} NO encontrado en workers[], usando config general`);
        }
      } else {
        console.log(`ℹ️  Servicio ${service.id} no tiene array workers[], usando config general`);
      }

      // ========================================================================
      // PRIORIDAD 2: Si no hay configuración específica, usar valores generales
      // ========================================================================
      if (!workerAssigned) {
        if (service.percentage !== undefined && service.percentage !== null) {
          workerPercentage = Number(service.percentage);
          configSource = 'service_general_percentage';
          console.log(`📊 Usando porcentaje general del servicio: ${workerPercentage}%`);
        } else {
          throw new BadRequestException(
            `El servicio "${service.name}" (ID: ${service.id}) no tiene configurado el porcentaje para el trabajador ${extraService.providerId}. ` +
            `Debe estar en service.workers[] o en service.percentage`
          );
        }
      }

      // Si no se encontró tiempo específico, validar que exista tiempo estándar
      if (!configSource.includes('workers_array_time')) {
        if (service.standardTime !== undefined && service.standardTime !== null) {
          detailTime = Number(service.standardTime);
          configSource = configSource ? `${configSource}, service_standard_time` : 'service_standard_time';
          console.log(`⏱️  Usando tiempo estándar del servicio: ${detailTime} minutos`);
        } else {
          console.warn(`⚠️  Servicio ${service.id} no tiene tiempo configurado, usando 0`);
          detailTime = 0;
        }
      }

      // Si el frontend envía durationMinutes, puede sobrescribir (opcional)
      if (extraService.durationMinutes !== undefined && extraService.durationMinutes !== null) {
        console.log(`🔧 Frontend especificó duración: ${extraService.durationMinutes} minutos (sobrescribiendo ${detailTime})`);
        detailTime = extraService.durationMinutes;
        configSource = configSource ? `${configSource}, frontend_override` : 'frontend_override';
      }

      companyPercentage = 100 - workerPercentage;

      // Validar porcentajes
      this.validateServicePercentagesAndTime(service);

      if (workerPercentage < 0 || workerPercentage > 100) {
        throw new BadRequestException(
          `El porcentaje del trabajador (${workerPercentage}%) debe estar entre 0 y 100 para el servicio "${service.name}"`
        );
      }

      if (companyPercentage < 0 || companyPercentage > 100) {
        throw new BadRequestException(
          `El porcentaje de la compañía (${companyPercentage}%) debe estar entre 0 y 100 para el servicio "${service.name}"`
        );
      }

      console.log(`📋 Configuración final para ${service.name}:`);
      console.log(`   - Porcentaje trabajador: ${workerPercentage}%`);
      console.log(`   - Porcentaje compañía: ${companyPercentage}%`);
      console.log(`   - Tiempo: ${detailTime} minutos`);
      console.log(`   - Fuente: ${configSource}`);

      // ========================================================================
      // Determinar el precio final según priceOption
      // ========================================================================
      let finalPrice = 0;

      switch (extraService.priceOption) {
        case 'default':
          const serviceCost = service.cost || 0;
          if (typeof serviceCost === 'string') {
            finalPrice = parseFloat(serviceCost);
          } else if (typeof serviceCost === 'number') {
            finalPrice = serviceCost;
          } else {
            finalPrice = parseFloat(String(serviceCost));
          }
          console.log(`💰 Precio: default (${finalPrice})`);
          break;

        case 'custom':
          if (extraService.customPrice === undefined || extraService.customPrice === null) {
            throw new BadRequestException(
              `Debe proporcionar customPrice cuando priceOption es "custom" para el servicio ${service.name}`
            );
          }
          finalPrice = extraService.customPrice;
          console.log(`💰 Precio: custom (${finalPrice})`);
          break;

        case 'free':
          finalPrice = 0;
          console.log(`💰 Precio: free (0)`);
          break;

        default:
          throw new BadRequestException(
            `priceOption inválido: ${extraService.priceOption}. Debe ser "default", "custom" o "free"`
          );
      }

      if (finalPrice < 0) {
        throw new BadRequestException(
          `El precio del servicio "${service.name}" no puede ser negativo`
        );
      }

      // Calcular montos (trabajador/compañía)
      const calculatedAmounts = this.calculateAmounts(finalPrice, workerPercentage, companyPercentage);

      // Parsear la fecha y hora
      let startDatetime: Date;
      try {
        const dateTimeParts = `${extraService.date} ${extraService.time}`;
        startDatetime = new Date(dateTimeParts);

        if (isNaN(startDatetime.getTime())) {
          throw new Error('Fecha inválida');
        }
      } catch (error) {
        throw new BadRequestException(
          `Formato de fecha/hora inválido para el servicio ${service.name}: date="${extraService.date}", time="${extraService.time}"`
        );
      }

      // Acumular totales
      extraTotalCost += calculatedAmounts.cost;
      extraTotalTime += detailTime;

      const workerName = companyWorker.worker
        ? `${companyWorker.worker.name || ''} ${companyWorker.worker.lastName || ''}`.trim()
        : `Trabajador ID: ${companyWorker.id}`;

      // Guardar validación
      validations.push({
        extraService,
        service,
        companyWorker,
        workerPercentage,
        companyPercentage,
        workerAssigned,
        finalPrice,
        calculatedAmounts,
        workerName,
        detailTime,
        startDatetime,
        configSource
      });

      // Agregar a cálculos
      calculations.push({
        serviceId: extraService.serviceId,
        serviceName: service.name || '',
        companyWorkerId: extraService.providerId,
        workerName: workerName,
        totalCost: calculatedAmounts.cost,
        totalTime: detailTime,
        workerPercentage,
        companyPercentage,
        totalWorker: calculatedAmounts.totalWorker,
        totalCompany: calculatedAmounts.totalCompany,
        calculationDetails: calculatedAmounts.calculationDetails,
        priceOption: extraService.priceOption,
        isExtra: true,
        configSource // NUEVO: indica de dónde salió la config
      });
    }

    // 8. Iniciar transacción para crear detalles y actualizar sesión
    const queryRunner = this.sessionRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const addedDetails: SessionDetail[] = [];

    try {
      // 9. Crear los SessionDetail con isExtra: true
      for (const validation of validations) {
        const { extraService, calculatedAmounts, detailTime, startDatetime } = validation;

        const sessionDetailData = {
          cost: calculatedAmounts.cost,
          serviceId: extraService.serviceId,
          companyWorkerId: extraService.providerId,
          sessionId: session.id,
          startDatetime: startDatetime,
          totalTime: detailTime,
          totalWorker: calculatedAmounts.totalWorker,
          totalCompany: calculatedAmounts.totalCompany,
          status: 1, // Agendado por defecto
          isExtra: true // Marcar como servicio extra
        };

        const sessionDetail = this.sessionDetailRepository.create(sessionDetailData);
        const savedDetail = await queryRunner.manager.save(sessionDetail);
        addedDetails.push(savedDetail);
      }

      // 10. Actualizar los totales de la sesión
      const newTotalCost = previousTotalCost + extraTotalCost;
      const newTotalTime = previousTotalTime + extraTotalTime;

      await queryRunner.manager.update(
        Session,
        { id: session.id, clientId: session.clientId },
        {
          totalCost: newTotalCost,
          totalTime: newTotalTime
        }
      );

      // 11. Actualizar el campo extra_services en la sesión
      const existingExtraServices = session.extraServices || [];

      const newExtraServices = addExtraServicesDto.extraServices.map((es, index) => {
        const addedDetail = addedDetails[index];
        return {
          sessionDetailId: addedDetail.id,
          serviceId: es.serviceId,
          serviceName: es.serviceName,
          providerId: es.providerId,
          providerName: es.providerName,
          date: es.date,
          time: es.time,
          durationMinutes: es.durationMinutes,
          priceOption: es.priceOption,
          price: es.price,
          ...(es.customPrice !== undefined && { customPrice: es.customPrice }),
          createdAt: es.createdAt || new Date().toISOString()
        };
      });

      const updatedExtraServices = [...existingExtraServices, ...newExtraServices];

      await queryRunner.manager.update(
        Session,
        { id: session.id, clientId: session.clientId },
        {
          extraServices: updatedExtraServices
        }
      );

      // 12. Commit de la transacción
      await queryRunner.commitTransaction();

      console.log(`✅ ${addedDetails.length} servicio(s) extra(s) agregado(s) a la sesión ${sessionId}`);

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(`Error al agregar servicios extras: ${error.message}`);
    } finally {
      await queryRunner.release();
    }

    // 13. Obtener la sesión actualizada
    const updatedSession = await this.sessionRepository.findOne({
      where: { id: sessionId }
    });

    if (!updatedSession) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada después de actualizar`);
    }

    // 14. Enviar correos de confirmación
    for (let i = 0; i < validations.length; i++) {
      const validation = validations[i];
      const addedDetail = addedDetails[i];

      try {
        await this.sendConfirmationEmails(
          updatedSession,
          addedDetail,
          session.clientId,
          validation.extraService.providerId,
          validation.extraService.serviceId,
          adminCompany.id
        );
      } catch (error) {
        this.logger.warn(`⚠️ Error enviando correos para servicio extra: ${error.message}`);
      }
    }

    // 15. Actualizar automáticamente el estado de la sesión
    try {
      await this.updateSessionStatusBasedOnDetails(sessionId);
      console.log(`✅ Estado de sesión actualizado automáticamente después de agregar servicios extras`);
    } catch (error) {
      console.warn(`⚠️ No se pudo actualizar automáticamente el estado de la sesión: ${error.message}`);
    }

    // 16. Retornar resultado
    return {
      message: `Se agregaron ${addedDetails.length} servicio(s) extra(s) a la sesión exitosamente`,
      session: updatedSession,
      addedDetails,
      calculations,
      previousTotals: {
        totalCost: previousTotalCost,
        totalTime: previousTotalTime
      },
      newTotals: {
        totalCost: Number(updatedSession.totalCost),
        totalTime: Number(updatedSession.totalTime)
      }
    };
  }


  /**
   * Cancela una sesión (cita) y todos sus detalles, tanto para administradores como para clientes.
   * @param sessionId ID de la sesión a cancelar
   * @param userId ID del usuario que realiza la acción (admin o cliente)
   * @param userRole Rol del usuario: 'adm' o 'cli'
   * @param cancelDto Opcional: motivo de cancelación
   */
  async cancelSession(
    sessionId: number,
    userId: number,
    userRole: 'adm' | 'cli',
    cancelDto?: CancelSessionDto,
  ): Promise<{
    message: string;
    session: Session;
    cancelledDetailsCount: number;
    reason?: string;
  }> {
    this.logger.log(`🛑 Cancelando sesión ${sessionId} por ${userRole} (userId: ${userId})`);

    // 1. Buscar la sesión
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // 2. Validar que la sesión pueda cancelarse
    if (session.sessionStatus === 5) {
      throw new BadRequestException('La sesión ya está cancelada');
    }
    if (session.sessionStatus === 3 || session.sessionStatus === 4) {
      throw new BadRequestException(
        'No se puede cancelar una sesión completada o pagada',
      );
    }

    // 3. Validar permisos según el rol
    if (userRole === 'adm') {
      const adminCompany = await this.companyRepository.findOne({
        where: { userId },
      });
      if (!adminCompany) {
        throw new NotFoundException('El administrador no tiene una compañía asignada');
      }

      const sessionDetails = await this.sessionDetailRepository.find({
        where: { sessionId },
      });
      let sessionBelongsToAdmin = false;
      for (const detail of sessionDetails) {
        const companyWorker = await this.companyWorkerRepository.findOne({
          where: { id: detail.companyWorkerId },
          relations: ['company'],
        });
        if (companyWorker?.company?.id === adminCompany.id) {
          sessionBelongsToAdmin = true;
          break;
        }
      }
      if (!sessionBelongsToAdmin) {
        throw new ForbiddenException('No tienes permiso para cancelar esta sesión');
      }
    } else if (userRole === 'cli') {
      // Verificar que la sesión pertenezca al cliente autenticado
      const client = await this.clientRepository.findOne({
        where: { userId },
      });
      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }
      if (session.clientId !== client.id) {
        throw new ForbiddenException('No puedes cancelar una cita que no te pertenece');
      }
    }

    // 4. Iniciar transacción
    const queryRunner = this.sessionRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 5. Actualizar estado de la sesión a 5 = Cancelada
      session.sessionStatus = 5;
      const updatedSession = await queryRunner.manager.save(session);

      // 6. Actualizar todos los detalles de la sesión a 4 = Cancelado
      const updateResult = await queryRunner.manager
        .createQueryBuilder()
        .update(SessionDetail)
        .set({ status: 4 })
        .where('sessionId = :sessionId', { sessionId })
        .execute();

      await queryRunner.commitTransaction();

      this.logger.log(
        `✅ Sesión ${sessionId} cancelada, ${updateResult.affected} detalle(s) actualizados`,
      );

      // 7. Enviar correos de cancelación (asíncrono, no bloquea)
      this.sendCancellationEmails(session, cancelDto?.reason).catch((error) => {
        this.logger.error(`Error enviando correos de cancelación: ${error.message}`);
      });

      return {
        message: 'Cita cancelada exitosamente',
        session: updatedSession,
        cancelledDetailsCount: updateResult.affected || 0,
        reason: cancelDto?.reason,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`❌ Error cancelando sesión: ${error.message}`, error.stack);
      throw new BadRequestException(`Error al cancelar la sesión: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  private async sendCancellationEmails(
    session: Session,
    reason?: string,
  ): Promise<void> {
    try {
      const clientInfo = await this.getClientInfo(session.clientId);
      const sessionDetails = await this.sessionDetailRepository.find({
        where: { sessionId: session.id },
      });

      // Obtener información de la compañía (asumimos que todos los detalles pertenecen a la misma)
      let companyName = '';
      let companyEmail = '';
      let companyAddress = '';

      if (sessionDetails.length > 0) {
        const firstDetail = sessionDetails[0];
        const companyWorker = await this.companyWorkerRepository.findOne({
          where: { id: firstDetail.companyWorkerId },
          relations: ['company'],
        });
        if (companyWorker?.company) {
          companyName = companyWorker.company.name;
          companyEmail = companyWorker.company.email || '';
          companyAddress = companyWorker.company.location || '';
        }
      }

      // Formatear fecha y hora
      const formatted = this.emailService.formatSessionDate(session.sessionDatetime);

      // Enviar correo al cliente
      if (clientInfo.email) {
        await this.emailService.sendSessionCancellationToClient(
          clientInfo.email,
          clientInfo.name,
          {
            date: formatted.date,
            time: formatted.time,
            reason: reason || 'No se especificó motivo',
          },
          {
            name: companyName,
            email: companyEmail,
            address: companyAddress,
          },
        );
        this.logger.log(`✅ Correo de cancelación enviado al cliente: ${clientInfo.email}`);
      }

      // Enviar correo a cada trabajador involucrado
      for (const detail of sessionDetails) {
        const companyWorker = await this.companyWorkerRepository.findOne({
          where: { id: detail.companyWorkerId },
          relations: ['worker', 'worker.user'],
        });
        if (!companyWorker?.worker) continue;

        const workerUser = await this.userRepository.findOne({
          where: { id: companyWorker.worker.userId },
        });
        const workerEmail = workerUser?.email;
        if (!workerEmail) continue;

        const service = await this.serviceRepository.findOne({
          where: { id: detail.serviceId },
        });

        await this.emailService.sendSessionCancellationToWorker(
          workerEmail,
          `${companyWorker.worker.name || ''} ${companyWorker.worker.lastName || ''}`.trim(),
          {
            date: formatted.date,
            time: formatted.time,
            serviceName: service?.name || 'Servicio',
            clientName: clientInfo.name,
            reason: reason || 'No se especificó motivo',
          },
        );
        this.logger.log(`✅ Correo de cancelación enviado al trabajador: ${workerEmail}`);
      }
    } catch (error) {
      this.logger.error(
        `❌ Error enviando correos de cancelación: ${error.message}`,
        error.stack,
      );
    }
  }



  /**
 * Obtiene todas las sesiones (citas) del cliente autenticado.
 * Incluye los detalles de los servicios, trabajadores y compañías.
 * Aplica filtros de fecha y estado, y paginación.
 *
 * @param clientUserId ID del usuario cliente autenticado
 * @param getSessionsDto DTO con parámetros de filtro y paginación
 * @returns Lista paginada de sesiones del cliente
 */
  async getSessionsForAuthenticatedClient(
    clientUserId: number,
    getSessionsDto: GetSessionsDto
  ): Promise<PaginationResult<any>> {
    console.log(`👤 Obteniendo sesiones para cliente autenticado (userId: ${clientUserId})`);

    // 1. Obtener el cliente a partir del userId
    const client = await this.clientRepository.findOne({
      where: { userId: clientUserId }
    });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const clientId = client.id;

    // 2. Construir la consulta principal (obtener detalles con paginación)
    const query = this.sessionDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('session', 'session', 'session.id = detail.session_id')
      .leftJoin('service', 'service', 'service.id = detail.service_id')
      .leftJoin('company_worker', 'companyWorker', 'companyWorker.id = detail.company_worker_id')
      .leftJoin('worker', 'worker', 'worker.id = companyWorker.worker_id')
      .leftJoin('company', 'company', 'company.id = companyWorker.company_id')
      .select([
        // Campos de la sesión
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
        'session.description_ia AS descriptionIA',
        'session.description AS description',
        'session.extra_services AS extraServices',

        // Campos del detalle (servicio)
        'detail.id AS detailId',
        'detail.cost AS cost',
        'detail.total_time AS totalTime',
        'detail.total_worker AS totalWorker',
        'detail.total_company AS totalCompany',
        'detail.status AS detailStatus',
        'detail.start_datetime AS detailStartDatetime',
        'detail.is_extra AS isExtra',

        // Campos del servicio
        'service.id AS serviceId',
        'service.name AS serviceName',
        'service.description AS serviceDescription',

        // Campos del trabajador / compañía
        'companyWorker.id AS companyWorkerId',
        'company.id AS companyId',
        'company.name AS companyName',
        'worker.id AS workerId',
        'worker.name AS workerName',
        'worker.last_name AS workerLastName'
      ])
      .where('session.client_id = :clientId', { clientId });

    // =========================================================================
    // FILTROS DE FECHA (sobre session.session_datetime)
    // =========================================================================

    // PRIORIDAD 1: Fecha específica
    if (getSessionsDto.date) {
      const dateStr = getSessionsDto.date.split('T')[0].split(' ')[0];
      const [year, month, day] = dateStr.split('-').map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      query.andWhere('session.session_datetime BETWEEN :startOfDay AND :endOfDay', {
        startOfDay,
        endOfDay
      });
      console.log(`📅 Cliente: Filtrando por fecha específica: ${dateStr}`);
    }
    // PRIORIDAD 2: Día actual
    else if (getSessionsDto.today) {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

      query.andWhere('session.session_datetime BETWEEN :startOfDay AND :endOfDay', {
        startOfDay,
        endOfDay
      });
      console.log(`📅 Cliente: Filtrando por día actual (${today.toLocaleDateString()})`);
    }
    // PRIORIDAD 3: Rango de fechas
    else if (getSessionsDto.startDate && getSessionsDto.endDate) {
      query.andWhere('session.session_datetime BETWEEN :startDate AND :endDate', {
        startDate: new Date(getSessionsDto.startDate),
        endDate: new Date(getSessionsDto.endDate)
      });
    }

    // FILTRO: Estado de la sesión
    if (getSessionsDto.sessionStatus !== undefined) {
      query.andWhere('session.session_status = :sessionStatus', {
        sessionStatus: getSessionsDto.sessionStatus
      });
    }

    // FILTRO: Solo sesiones con estado "Agendado" (atajo)
    if (getSessionsDto.onlyScheduled) {
      query.andWhere('session.session_status = 1');
    }

    // FILTRO: Estado del detalle (opcional)
    if (getSessionsDto.detailStatus !== undefined) {
      query.andWhere('detail.status = :detailStatus', {
        detailStatus: getSessionsDto.detailStatus
      });
    }

    // Ordenar por fecha de la sesión (más reciente por defecto)
    query.orderBy('session.session_datetime', getSessionsDto.orderBy === 'oldest' ? 'ASC' : 'DESC');

    // Aplicar paginación
    const details = await query
      .skip((getSessionsDto.page - 1) * getSessionsDto.limit)
      .take(getSessionsDto.limit)
      .getRawMany();

    // =========================================================================
    // CONSULTA DE CONTEO: total de SESIONES distintas que cumplen los filtros
    // =========================================================================
    const countQuery = this.sessionDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('session', 'session', 'session.id = detail.session_id')
      .where('session.client_id = :clientId', { clientId });

    // Replicar los mismos filtros de fecha
    if (getSessionsDto.date) {
      const dateStr = getSessionsDto.date.split('T')[0].split(' ')[0];
      const [year, month, day] = dateStr.split('-').map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      countQuery.andWhere('session.session_datetime BETWEEN :startOfDay AND :endOfDay', { startOfDay, endOfDay });
    } else if (getSessionsDto.today) {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      countQuery.andWhere('session.session_datetime BETWEEN :startOfDay AND :endOfDay', { startOfDay, endOfDay });
    } else if (getSessionsDto.startDate && getSessionsDto.endDate) {
      countQuery.andWhere('session.session_datetime BETWEEN :startDate AND :endDate', {
        startDate: new Date(getSessionsDto.startDate),
        endDate: new Date(getSessionsDto.endDate)
      });
    }

    if (getSessionsDto.sessionStatus !== undefined) {
      countQuery.andWhere('session.session_status = :sessionStatus', { sessionStatus: getSessionsDto.sessionStatus });
    }
    if (getSessionsDto.onlyScheduled) {
      countQuery.andWhere('session.session_status = 1');
    }
    if (getSessionsDto.detailStatus !== undefined) {
      countQuery.andWhere('detail.status = :detailStatus', { detailStatus: getSessionsDto.detailStatus });
    }

    const countResult = await countQuery
      .select('COUNT(DISTINCT session.id)', 'total')
      .getRawOne();

    const total = parseInt(countResult?.total || '0', 10);

    // =========================================================================
    // AGRUPAR POR SESIÓN
    // =========================================================================
    const sessionMap = new Map<number, any>();

    for (const detail of details) {
      const sessionId = detail.sessionId;

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          // Datos de la sesión
          id: sessionId,
          clientId: detail.clientId,
          sessionDatetime: detail.sessionDatetime,
          sessionStatus: detail.sessionStatus,
          sessionStatusText: this.getSessionStatusText(detail.sessionStatus),
          sessionTotalCost: parseFloat(detail.sessionTotalCost) || 0,
          sessionTotalTime: parseFloat(detail.sessionTotalTime) || 0,
          startDatetime: detail.sessionStartDatetime,
          status: detail.sessionStatusFlag,
          iaResponse: detail.iaResponse,
          descriptionIA: detail.descriptionIA,
          description: detail.description,
          extraServices: detail.extraServices,
          createdAt: detail.sessionUpdatedAt,

          // Servicios de la sesión
          services: [],
          // Totales calculados (se actualizarán)
          totalCost: 0,
          totalTime: 0,
          servicesCount: 0
        });
      }

      const sessionData = sessionMap.get(sessionId);

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

      sessionData.services.push({
        detailId: detail.detailId,
        serviceId: detail.serviceId,
        serviceName: detail.serviceName || 'Servicio no encontrado',
        serviceDescription: detail.serviceDescription || '',
        cost,
        totalTime,
        totalWorker,
        totalCompany,
        detailStatus: detail.detailStatus || 1,
        detailStatusText: this.getDetailStatusText(detail.detailStatus || 1),
        startDatetime: detail.detailStartDatetime,
        isExtra: detail.isExtra === true || detail.isExtra === 1,
        companyId: detail.companyId,
        companyName: detail.companyName || 'Compañía no encontrada',
        workerPercentage,
        companyPercentage,
        workerName: detail.workerName,
        workerLastName: detail.workerLastName
      });

      sessionData.totalCost += cost;
      sessionData.totalTime += totalTime;
      sessionData.servicesCount += 1;
    }

    // Convertir el mapa a array
    const sessions = Array.from(sessionMap.values()).map(session => ({
      ...session,
      totalCost: parseFloat(session.totalCost.toFixed(2)),
      totalTime: parseFloat(session.totalTime.toFixed(2))
    }));

    // Ordenar nuevamente por si acaso (aunque ya se ordenó en la query)
    if (getSessionsDto.orderBy === 'oldest') {
      sessions.sort((a, b) => new Date(a.sessionDatetime).getTime() - new Date(b.sessionDatetime).getTime());
    } else {
      sessions.sort((a, b) => new Date(b.sessionDatetime).getTime() - new Date(a.sessionDatetime).getTime());
    }

    return {
      data: sessions,
      meta: {
        page: getSessionsDto.page,
        limit: getSessionsDto.limit,
        total,
        totalPages: Math.ceil(total / getSessionsDto.limit),
        hasNext: getSessionsDto.page < Math.ceil(total / getSessionsDto.limit),
        hasPrev: getSessionsDto.page > 1
      }
    };
  }
}