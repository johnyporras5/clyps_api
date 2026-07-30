import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, Not, DeepPartial, Brackets } from 'typeorm';
import { Session } from './entities/session.entity';
import { SessionPayment } from './entities/session-payment.entity';
import { SessionPaymentLine } from './entities/session-payment-line.entity';
import { SessionPaymentTip } from './entities/session-payment-tip.entity';
import { RegisterSessionPaymentDto } from './dto/register-session-payment.dto';
import { PayrollPeriodService } from '../payroll/payroll-period.service';
import { PayrollEarningsService } from '../payroll/payroll-earnings.service';
import { FeedbacksService } from '../feedbacks/feedbacks.service';
import { CreateSessionDto } from './dto/create-session.dto';
import {
  CreateSessionWithDetailDto,
  SessionDetailItemDto,
} from './dto/create-session-with-detail.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { RescheduleSessionDto } from './dto/reschedule-session.dto';
import { Client } from '../client/entities/client.entity';
import { Company } from '../company/entities/company.entity';
import { User } from '../user/entities/user.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { Service } from '../service/entities/service.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Worker } from '../worker/entities/worker.entity';
import { EmailService } from '../email/email.service';
import { PaginationResult } from '../common/dto/pagination.dto';
import {
  BUSINESS_TIMEZONE,
  businessDayBounds,
  businessDayBoundsForInstant,
  businessRangeBounds,
  businessToday,
  inclusiveDayCount,
} from '../common/utils/business-time.util';
import { UpdateSessionDto } from './dto/update-session-and-detail.dto';
import { GetSessionsDto } from './dto/get-sessions.dto';
import {
  SessionResponse,
  SessionDetailResponse,
  OfferDetailResponse,
} from './types/session-response.type';
import { UpdateSessionStatusDto } from './dto/update-session-status.dto';
import { UpdateDetailStatusDto } from './dto/update-detail-status.dto';
import {
  AddExtraServicesDto,
  ExtraServiceItemDto,
} from './dto/add-extra-services.dto';
import { CancelSessionDto } from './dto/cancel-session.dto';
import { AssignWorkersToSessionDto } from './dto/assign-workers-to-session.dto';
import { ChangeDetailServiceDto } from './dto/change-detail-service.dto';
import { IAPromptsService } from '../IAprompts/ia_prompts.service';
import { FileUploadService } from '../common/services/file_upload.service';
import { Offer } from 'src/Offer/entities/offer.entity';
import { ServiceOffer } from 'src/Offer/entities/service-offer.entity';

/**
 * Un servicio (detalle) que el arrastre (ripple) movió de hora: la agendada
 * siguiente que se empujó para no solaparse con la cita que se atrasó/extendió.
 * Lo devuelven las mutaciones (Comenzar/Terminar/reprogramar) para que el
 * controller notifique (push + correo) al cliente afectado.
 */
export interface RippleMovedDetail {
  detailId: number;
  sessionId: number;
  oldStart: Date;
  newStart: Date;
}

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
    @InjectRepository(SessionPayment)
    private sessionPaymentRepository: Repository<SessionPayment>,
    @InjectRepository(SessionPaymentLine)
    private sessionPaymentLineRepository: Repository<SessionPaymentLine>,
    @InjectRepository(SessionPaymentTip)
    private sessionPaymentTipRepository: Repository<SessionPaymentTip>,
    private fileUploadService: FileUploadService,
    private payrollPeriodService: PayrollPeriodService,
    private payrollEarningsService: PayrollEarningsService,
    private feedbacksService: FeedbacksService,
  ) {}

  async create(
    createSessionDto: CreateSessionDto,
    _adminId: number,
  ): Promise<Session> {
    const existingSession = await this.checkExistingSession(createSessionDto);

    if (existingSession) {
      throw new BadRequestException({
        message: 'Ya existe una sesión con los mismos datos',
        existingSession: existingSession,
        duplicateData: {
          clientId: createSessionDto.clientId,
          sessionDatetime: createSessionDto.sessionDatetime,
          sessionStatus: createSessionDto.sessionStatus,
        },
      });
    }

    const sessionData = {
      ...createSessionDto,
      sessionStatus:
        createSessionDto.sessionStatus !== undefined
          ? createSessionDto.sessionStatus
          : 1,
      status:
        createSessionDto.status !== undefined ? createSessionDto.status : 1,
      startDatetime:
        createSessionDto.startDatetime ||
        createSessionDto.sessionDatetime ||
        new Date(),
    };
    // Hora agendada original de la cita: se fija al crear y no se mueve luego.
    (sessionData as DeepPartial<Session>).originalStartDatetime =
      sessionData.startDatetime;

    console.log('📝 Datos de sesión a crear (admin):', {
      sessionDatetime: createSessionDto.sessionDatetime,
      startDatetime: sessionData.startDatetime,
      sessionData: sessionData,
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
    companyWorkerId: number,
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
    if (
      service.workers &&
      Array.isArray(service.workers) &&
      service.workers.length > 0
    ) {
      const workerAssignment = service.workers.find(
        (worker: any) => worker.id === companyWorkerId,
      );

      if (workerAssignment) {
        // Si el trabajador tiene porcentaje específico, usarlo
        if (
          workerAssignment.percentage !== undefined &&
          workerAssignment.percentage !== null
        ) {
          workerPercentage = workerAssignment.percentage;
          workerAssigned = true;
        }

        // Si el trabajador tiene un tiempo específico VÁLIDO (> 0), usarlo. Un
        // tiempo en 0/negativo NO debe pisar el standardTime del servicio: si no,
        // la cita se guardaría con duración 0 (fin = inicio) y el chequeo de
        // solape se saltaría por completo.
        if (
          workerAssignment.time !== undefined &&
          workerAssignment.time !== null &&
          Number(workerAssignment.time) > 0
        ) {
          time = Number(workerAssignment.time);
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
          `El servicio ${service.id} no tiene configurado el porcentaje para el trabajador.`,
        );
      }
    }

    companyPercentage = 100 - workerPercentage;

    // Validaciones de porcentajes
    if (workerPercentage < 0 || workerPercentage > 100) {
      throw new BadRequestException(
        `El porcentaje del trabajador (${workerPercentage}%) debe estar entre 0 y 100`,
      );
    }

    if (companyPercentage < 0 || companyPercentage > 100) {
      throw new BadRequestException(
        `El porcentaje de la compañía (${companyPercentage}%) debe estar entre 0 y 100`,
      );
    }

    const total = workerPercentage + companyPercentage;
    if (Math.abs(total - 100) > 0.01) {
      throw new BadRequestException(
        `La suma de porcentajes (${total}%) debe ser 100%`,
      );
    }

    return { workerPercentage, companyPercentage, workerAssigned, time };
  }
  private calculateAmounts(
    totalCost: number,
    workerPercentage: number,
    companyPercentage: number,
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
    const adjustedTotalWorker = totalWorker;
    let adjustedTotalCompany = totalCompany;

    if (Math.abs(totalCost - totalCalculated) > 0.01) {
      adjustedTotalCompany = Number((totalCost - totalWorker).toFixed(2));
    }

    const calculationDetails = `Cálculo: ${totalCost} × (${workerPercentage}% trabajador + ${companyPercentage}% compañía) = ${adjustedTotalWorker} + ${adjustedTotalCompany}`;

    return {
      cost: totalCost,
      totalWorker: adjustedTotalWorker,
      totalCompany: adjustedTotalCompany,
      calculationDetails,
    };
  }

  private async checkExistingSessionDetail(
    sessionId: number,
    serviceId: number,
    companyWorkerId: number,
  ): Promise<SessionDetail | null> {
    const existingDetail = await this.sessionDetailRepository.findOne({
      where: {
        sessionId: sessionId,
        serviceId: serviceId,
        companyWorkerId: companyWorkerId,
      },
    });

    return existingDetail;
  }

  private async resolveWorkerContext(
    caller: AuthenticatedUser,
  ): Promise<{ companyId: number; companyWorkerId: number }> {
    if (caller.companyWorkerId != null) {
      const tokenCw = await this.companyWorkerRepository.findOne({
        where: { id: caller.companyWorkerId, userId: caller.sub, isActive: 1 },
      });
      if (tokenCw) {
        return { companyId: tokenCw.companyId, companyWorkerId: tokenCw.id };
      }
    }
    const cw = await this.companyWorkerRepository.findOne({
      where: { userId: caller.sub, isActive: 1 },
    });
    if (!cw) {
      throw new NotFoundException(
        'El trabajador no está asociado a ninguna compañía activa',
      );
    }
    return { companyId: cw.companyId, companyWorkerId: cw.id };
  }

  /** Duración en minutos entre dos instantes (fin - inicio); null si inválido. */
  private durationMinutesFromRange(
    start?: Date | string | null,
    end?: Date | string | null,
  ): number | null {
    if (!start || !end) return null;
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    if (isNaN(s) || isNaN(e) || e <= s) return null;
    return Math.round((e - s) / 60000);
  }

  /**
   * Resuelve el fin de un detalle: el fin explícito si viene; si no, inicio +
   * duración (minutos). Devuelve null si no hay inicio (CLYP-311).
   */
  private resolveDetailEnd(
    start: Date | string | null | undefined,
    explicitEnd: Date | string | null | undefined,
    totalTimeMinutes: number,
  ): Date | null {
    if (explicitEnd) {
      const e = new Date(explicitEnd);
      if (!isNaN(e.getTime())) return e;
    }
    if (!start) return null;
    const s = new Date(start).getTime();
    if (isNaN(s)) return null;
    return new Date(s + (totalTimeMinutes || 0) * 60000);
  }

  /**
   * Arrastre (ripple) de la agenda de UN worker en UN día. Tras mover/extender
   * un servicio (Comenzar/Terminar o reprogramar), barre en orden cronológico
   * los servicios de ese company_worker y empuja hacia abajo SOLO los AGENDADOS
   * (status 1) que se solapan con el bloque anterior, y solo lo justo para
   * quitar el cruce (respeta huecos). Es idempotente: recalcula desde las
   * posiciones actuales, no acumula desplazamientos.
   *
   * No mueve: cancelados (5), ya iniciados/completados (2/3/4), ni el propio
   * detalle disparador (respeta donde lo dejó el usuario). Solo la columna de
   * ESE worker; las de otros workers quedan intactas (decisión de negocio).
   *
   * Devuelve los detalles que cambiaron de hora (viejo→nuevo) para notificar a
   * sus clientes (push + correo).
   */
  /**
   * Tolerancia (±min) para considerar que un Comenzar/Terminar ocurrió "a
   * tiempo". Dentro de la tolerancia se conserva el horario pautado: no se
   * mueve el bloque, no se arrastran las citas siguientes y no se notifica
   * (empezar 1-5 min tarde no amerita reagendar a nadie). Mismo valor que usa
   * el front (LATE_START_TOLERANCE_MIN) para decidir si muestra el modal.
   */
  private static readonly SCHEDULE_TOLERANCE_MIN = 5;

  private static withinScheduleTolerance(a: Date, b: Date): boolean {
    return (
      Math.abs(a.getTime() - b.getTime()) <=
      SessionService.SCHEDULE_TOLERANCE_MIN * 60000
    );
  }

  private async rippleWorkerColumn(
    companyWorkerId: number | null | undefined,
    dayAnchor: Date | string | null | undefined,
    protectedDetailIds: number[] = [],
  ): Promise<RippleMovedDetail[]> {
    const moved: RippleMovedDetail[] = [];
    if (!companyWorkerId || !dayAnchor) return moved;
    const protectedSet = new Set(protectedDetailIds);

    const anchor = new Date(dayAnchor);
    if (isNaN(anchor.getTime())) return moved;

    try {
      // Ventana [00:00, 24:00) del día del ancla. UTC: las fechas llegan en Z, y
      // no arrastramos citas de otro día (tope al final de la jornada).
      const startOfDay = new Date(
        Date.UTC(
          anchor.getUTCFullYear(),
          anchor.getUTCMonth(),
          anchor.getUTCDate(),
          0,
          0,
          0,
        ),
      );
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

      const dayDetails = await this.sessionDetailRepository.find({
        where: {
          companyWorkerId,
          startDatetime: Between(startOfDay, endOfDay),
        },
      });

      // Orden cronológico por inicio; ignoramos cancelados y sin fecha.
      const ordered = dayDetails
        .filter((d) => d.status !== 5 && d.startDatetime)
        .sort(
          (a, b) =>
            new Date(a.startDatetime).getTime() -
            new Date(b.startDatetime).getTime(),
        );

      const toSave: SessionDetail[] = [];
      let cursor: number | null = null; // fin (ms) del último bloque colocado

      for (const d of ordered) {
        const s = new Date(d.startDatetime).getTime();
        const e = d.endDatetime
          ? new Date(d.endDatetime).getTime()
          : d.totalTime
            ? s + d.totalTime * 60000
            : s;
        const duration = Math.max(0, e - s);

        const overlaps = cursor !== null && s < cursor;
        // Solo se empuja lo AGENDADO y que no esté protegido (el/los detalles que
        // el usuario acaba de mover: se respetan donde los dejó).
        const pushable = d.status === 1 && !protectedSet.has(d.id);

        if (overlaps && pushable) {
          const newStartMs = cursor as number;
          const newStart = new Date(newStartMs);
          const newEnd = new Date(newStartMs + duration);
          moved.push({
            detailId: d.id,
            sessionId: d.sessionId,
            oldStart: new Date(s),
            newStart,
          });
          d.startDatetime = newStart;
          d.endDatetime = newEnd;
          toSave.push(d);
          cursor = newEnd.getTime();
        } else {
          // No se mueve (fijo o sin solape): el cursor avanza a su fin.
          cursor = cursor === null ? e : Math.max(cursor, e);
        }
      }

      if (toSave.length > 0) {
        await this.sessionDetailRepository.save(toSave);

        // Mantener session.start_datetime en sync con el detalle más temprano de
        // cada cita movida, para que la tarjeta/listado refleje el arrastre.
        const movedSessionIds = [...new Set(moved.map((m) => m.sessionId))];
        for (const sid of movedSessionIds) {
          const sdetails = await this.sessionDetailRepository.find({
            where: { sessionId: sid },
          });
          const startsMs = sdetails
            .filter((d) => d.status !== 5 && d.startDatetime)
            .map((d) => new Date(d.startDatetime).getTime());
          if (!startsMs.length) continue;
          const s = await this.sessionRepository.findOne({
            where: { id: sid },
          });
          if (s) {
            s.startDatetime = new Date(Math.min(...startsMs));
            await this.sessionRepository.save(s);
          }
        }
      }

      return moved;
    } catch (error) {
      // El arrastre no debe romper la mutación principal (Comenzar/Terminar/
      // reprogramar). Si algo falla, se registra y se sigue sin arrastre.
      console.warn(
        `⚠️ Ripple (arrastre) falló para worker ${companyWorkerId}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * CLYP-311: reprogramar / mover / redimensionar una cita.
   * - Gate por status: agendada (1/8) → inicio+fin; en proceso (2) → solo fin;
   *   completada(3)/pagada(4,6)/cancelada(5) → 409.
   * - Rol: admin cualquiera de su empresa; worker solo sus propias citas y no
   *   puede reasignar a otra trabajadora.
   * - Persiste startDatetime/endDatetime y recalcula totalTime. NO bloquea solape
   *   (admin/worker pueden solapar — regla del calendario).
   */
  async rescheduleSession(
    sessionId: number,
    dto: RescheduleSessionDto,
    caller: AuthenticatedUser,
  ): Promise<{
    message: string;
    session: Session;
    details: SessionDetail[];
    movedByRipple: RippleMovedDetail[];
  }> {
    // 1. Empresa del que reprograma.
    const isWorker = caller.userType === 'wrk';
    let callerCompanyId: number;
    let callerCompanyWorkerId: number | null = null;
    if (isWorker) {
      const ctx = await this.resolveWorkerContext(caller);
      callerCompanyId = ctx.companyId;
      callerCompanyWorkerId = ctx.companyWorkerId;
    } else {
      const company = await this.companyRepository.findOne({
        where: { userId: caller.sub },
      });
      if (!company) {
        throw new NotFoundException('No tienes una compañía asignada');
      }
      callerCompanyId = company.id;
    }

    // 2. Cargar la sesión y sus detalles.
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`Sesión ${sessionId} no encontrada`);
    }
    const details = await this.sessionDetailRepository.find({
      where: { sessionId },
    });
    if (details.length === 0) {
      throw new NotFoundException(`La sesión ${sessionId} no tiene servicios`);
    }

    // 3. La cita debe ser de la empresa del que reprograma.
    const sampleService = await this.serviceRepository.findOne({
      where: { id: details[0].serviceId },
    });
    if (!sampleService || sampleService.companyId !== callerCompanyId) {
      throw new ForbiddenException('Esta cita no pertenece a tu empresa');
    }

    // 4. Gate por status de la cita.
    const st = session.sessionStatus;
    if (st === 3 || st === 4 || st === 6) {
      throw new ConflictException(
        'No se puede reprogramar una cita completada, pagada o calificada',
      );
    }
    if (st === 5) {
      throw new ConflictException('No se puede reprogramar una cita cancelada');
    }
    const inProgress = st === 2;

    // 5. Detalles objetivo (uno puntual o toda la cita).
    const targetDetails = dto.detailId
      ? details.filter((d) => d.id === dto.detailId)
      : details;
    if (dto.detailId && targetDetails.length === 0) {
      throw new NotFoundException(
        `Detalle ${dto.detailId} no encontrado en la cita`,
      );
    }

    // 6. Worker: solo sus propias citas y sin reasignar a otra persona.
    if (isWorker) {
      const notOwn = targetDetails.some(
        (d) => d.companyWorkerId !== callerCompanyWorkerId,
      );
      if (notOwn) {
        throw new ForbiddenException(
          'Solo puedes reprogramar tus propias citas',
        );
      }
      if (
        dto.companyWorkerId != null &&
        dto.companyWorkerId !== callerCompanyWorkerId
      ) {
        throw new ForbiddenException(
          'Un trabajador no puede reasignar la cita a otra persona',
        );
      }
    }

    // CLYP-311: reasignar a otra trabajadora (mover de columna, solo admin) →
    // validar que exista, sea de la empresa y esté activa.
    if (dto.companyWorkerId != null && !isWorker) {
      const targetCw = await this.companyWorkerRepository.findOne({
        where: {
          id: dto.companyWorkerId,
          companyId: callerCompanyId,
          isActive: 1,
        },
      });
      if (!targetCw) {
        throw new BadRequestException(
          'La trabajadora destino no existe, no es de tu empresa o no está activa',
        );
      }
    }

    const newStart = dto.startDatetime ? new Date(dto.startDatetime) : null;
    const newEnd = dto.endDatetime ? new Date(dto.endDatetime) : null;

    // 7. En proceso: solo se puede cambiar el fin, no el inicio.
    if (inProgress && newStart) {
      const currentStart = dto.detailId
        ? targetDetails[0].startDatetime
        : session.startDatetime;
      if (
        currentStart &&
        new Date(currentStart).getTime() !== newStart.getTime()
      ) {
        throw new BadRequestException(
          'Una cita en proceso solo puede cambiar su hora de fin, no el inicio',
        );
      }
    }

    // 8. Fin > inicio (mínimo 15 min) cuando vienen ambos.
    // El fin debe ser posterior al inicio (duración positiva). No se impone un
    // mínimo fijo: hay servicios cortos (ej. 10 min) que son válidos.
    if (newStart && newEnd && newEnd.getTime() <= newStart.getTime()) {
      throw new BadRequestException(
        'La hora de fin debe ser posterior a la de inicio',
      );
    }

    // 9. Aplicar cambios.
    const moveWholeMultiDetail = !dto.detailId && details.length > 1;

    if (moveWholeMultiDetail) {
      // Mover toda la cita por el delta (inicio nuevo - inicio actual).
      if (!newStart) {
        throw new BadRequestException(
          'Falta startDatetime para mover la cita completa',
        );
      }
      const oldStartMs = session.startDatetime
        ? new Date(session.startDatetime).getTime()
        : details[0].startDatetime
          ? new Date(details[0].startDatetime).getTime()
          : null;
      if (oldStartMs === null) {
        throw new BadRequestException(
          'La cita no tiene una hora de inicio para mover',
        );
      }
      const delta = newStart.getTime() - oldStartMs;
      for (const d of details) {
        if (d.startDatetime) {
          const ns = new Date(new Date(d.startDatetime).getTime() + delta);
          d.startDatetime = ns;
          d.endDatetime = d.endDatetime
            ? new Date(new Date(d.endDatetime).getTime() + delta)
            : d.totalTime
              ? new Date(ns.getTime() + d.totalTime * 60000)
              : null;
        }
        if (dto.companyWorkerId != null && !isWorker) {
          d.companyWorkerId = dto.companyWorkerId;
        }
      }
      await this.sessionDetailRepository.save(details);
      session.startDatetime = newStart;
      session.sessionDatetime = newStart;
    } else {
      // Un solo detalle (o cita de un servicio): mover/resize ese detalle.
      const d = targetDetails[0];
      const start = newStart ?? d.startDatetime;
      let end: Date | null;
      if (newEnd) {
        end = newEnd;
      } else if (start && d.totalTime) {
        end = new Date(new Date(start).getTime() + d.totalTime * 60000);
      } else {
        end = d.endDatetime;
      }
      d.startDatetime = start;
      if (end) {
        d.endDatetime = end;
        if (start) {
          d.totalTime = Math.max(
            0,
            Math.round((end.getTime() - new Date(start).getTime()) / 60000),
          );
        }
      }
      if (dto.companyWorkerId != null && !isWorker) {
        d.companyWorkerId = dto.companyWorkerId;
      }
      await this.sessionDetailRepository.save(d);
      if (start) {
        session.startDatetime = start;
        session.sessionDatetime = start;
      }
    }

    // 10. Recalcular totalTime de la cita = span (max fin - min inicio).
    const refreshed = await this.sessionDetailRepository.find({
      where: { sessionId },
    });
    const starts = refreshed
      .map((d) =>
        d.startDatetime ? new Date(d.startDatetime).getTime() : null,
      )
      .filter((v): v is number => v !== null);
    const ends = refreshed
      .map((d) => (d.endDatetime ? new Date(d.endDatetime).getTime() : null))
      .filter((v): v is number => v !== null);
    if (starts.length && ends.length) {
      session.totalTime = Math.max(
        0,
        Math.round((Math.max(...ends) - Math.min(...starts)) / 60000),
      );
    }
    const savedSession = await this.sessionRepository.save(session);

    // Arrastre (ripple): mover/extender manual puede solapar con las citas
    // siguientes del mismo worker. Empujar las AGENDADAS posteriores de cada
    // columna afectada (protegiendo los detalles que el usuario acaba de mover).
    const movedByRipple: RippleMovedDetail[] = [];
    const ownIds = refreshed.map((d) => d.id);
    const workerIds = [
      ...new Set(
        refreshed
          .map((d) => d.companyWorkerId)
          .filter((id): id is number => !!id),
      ),
    ];
    for (const cwId of workerIds) {
      const moved = await this.rippleWorkerColumn(
        cwId,
        savedSession.startDatetime,
        ownIds,
      );
      movedByRipple.push(...moved);
    }

    return {
      message: 'Cita reprogramada correctamente',
      session: savedSession,
      details: refreshed,
      movedByRipple,
    };
  }

  async createSessionWithDetail(
    createSessionWithDetailDto: CreateSessionWithDetailDto,
    caller: AuthenticatedUser,
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
      companyWorkerId: number | null;
      workerName: string;
      totalCost: number;
      totalTime: number;
      workerPercentage: number;
      companyPercentage: number;
      totalWorker: number;
      totalCompany: number;
      calculationDetails: string;
      workerAssigned: boolean;
      isOffer: boolean;
      appliedOfferId: number | null;
      offerName: string | null;
      originalPrice: number | null;
    }>;
    createdDetails?: SessionDetail[];
    existingSession?: Session;
  }> {
    // 1. Validaciones iniciales
    if (!createSessionWithDetailDto.clientId) {
      throw new BadRequestException('La sesión debe tener un cliente asociado');
    }

    const adminId = caller.sub;

    // CLYP-306: el creador puede ser admin (empresa por userId) o worker
    // (provider): su empresa y company_worker vienen del token.
    const isWorker = caller.userType === 'wrk';
    let callerCompanyWorkerId: number | null = null;
    let adminCompany: Company | null;

    if (isWorker) {
      const ctx = await this.resolveWorkerContext(caller);
      callerCompanyWorkerId = ctx.companyWorkerId;
      adminCompany = await this.companyRepository.findOne({
        where: { id: ctx.companyId },
      });
    } else {
      adminCompany = await this.companyRepository.findOne({
        where: { userId: adminId },
      });
    }

    if (!adminCompany) {
      throw new NotFoundException(
        isWorker
          ? 'El trabajador no tiene una compañía asignada'
          : 'El administrador no tiene una compañía asignada',
      );
    }

    const companyId = adminCompany.id;
    const companyName = adminCompany.name;

    // CLYP-306: un trabajador solo puede agendar citas asignadas a SÍ MISMO.
    // Cualquier detail con otro companyWorkerId (o sin trabajador) → 403.
    if (isWorker) {
      const allSelf = (createSessionWithDetailDto.details || []).every(
        (d) =>
          d.companyWorkerId !== null &&
          d.companyWorkerId !== undefined &&
          d.companyWorkerId === callerCompanyWorkerId,
      );
      if (!allSelf) {
        throw new ForbiddenException(
          'Un trabajador solo puede crear citas asignadas a sí mismo.',
        );
      }

      // El cliente debe pertenecer a la empresa del trabajador.
      const client = await this.clientRepository.findOne({
        where: { id: createSessionWithDetailDto.clientId },
      });
      const belongs =
        !!client &&
        Array.isArray(client.companies) &&
        client.companies.includes(companyId);
      if (!belongs) {
        throw new ForbiddenException('El cliente no pertenece a tu empresa.');
      }
    }

    if (
      !createSessionWithDetailDto.details ||
      createSessionWithDetailDto.details.length === 0
    ) {
      throw new BadRequestException('Debe proporcionar al menos un servicio');
    }

    // 2. CLYP-311: en el flujo admin/worker NO se bloquea que el cliente tenga
    // otra cita a la misma hora. Un cliente puede recibir servicios simultáneos
    // de trabajadoras DISTINTAS (ej. manicura + cabello a la vez). El solape de
    // una MISMA trabajadora sí se rechaza más abajo (checkIfWorkerHasAppointment
    // AtSameTime). El flujo del cliente (createSessionByClient) sí mantiene el
    // bloqueo de "cliente a la misma hora".

    // 3. Definir tipo para las validaciones de servicio
    type ServiceValidationType = {
      detail: SessionDetailItemDto;
      service: Service;
      companyWorker: CompanyWorker | null;
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
      companyWorkerId: number | null;
      workerName: string;
      totalCost: number;
      totalTime: number;
      workerPercentage: number;
      companyPercentage: number;
      totalWorker: number;
      totalCompany: number;
      calculationDetails: string;
      workerAssigned: boolean;
      isOffer: boolean;
      appliedOfferId: number | null;
      offerName: string | null;
      originalPrice: number | null;
    }> = [];

    const serviceValidations: ServiceValidationType[] = [];

    // Pre-validar todos los servicios
    for (const detail of createSessionWithDetailDto.details) {
      const service = await this.serviceRepository.findOne({
        where: {
          id: detail.serviceId,
          companyId: adminCompany.id,
        },
      });

      if (!service) {
        throw new NotFoundException(
          `Servicio con ID ${detail.serviceId} no encontrado o no pertenece a tu compañía`,
        );
      }

      // Si no se asignó trabajador, el detalle queda pendiente de asignación.
      // El DTO garantiza que en ese caso venga offerId; saltamos las
      // validaciones de disponibilidad/porcentaje por trabajador.
      const hasWorker =
        detail.companyWorkerId !== null && detail.companyWorkerId !== undefined;

      let companyWorker: CompanyWorker | null = null;
      let workerPercentage = 0;
      let companyPercentage = 100;
      let workerAssigned = false;
      // CLYP-311: si viene fin explícito (detailEndDatetime), la duración =
      // fin - inicio y tiene prioridad sobre el tiempo del servicio/worker.
      const overrideMinutes = this.durationMinutesFromRange(
        detail.detailStartDatetime,
        detail.detailEndDatetime,
      );
      let detailTime = overrideMinutes ?? (Number(service.standardTime) || 0);

      // Validar estructura general de porcentajes/tiempos del servicio siempre.
      this.validateServicePercentagesAndTime(service);

      if (hasWorker) {
        companyWorker = await this.companyWorkerRepository.findOne({
          where: {
            id: detail.companyWorkerId as number,
            companyId: adminCompany.id,
          },
          relations: ['worker'],
        });

        if (!companyWorker) {
          throw new NotFoundException(
            `Trabajador de compañía con ID ${detail.companyWorkerId} no encontrado o no pertenece a tu compañía`,
          );
        }

        if (companyWorker.isActive !== 1) {
          throw new BadRequestException(
            `El trabajador de compañía con ID ${detail.companyWorkerId} no está activo`,
          );
        }

        const perc = this.calculatePercentagesAndTime(
          service,
          detail.companyWorkerId as number,
        );
        workerPercentage = perc.workerPercentage;
        companyPercentage = perc.companyPercentage;
        workerAssigned = perc.workerAssigned;
        detailTime = overrideMinutes ?? perc.time;

        // Verificar si el trabajador ya tiene una cita que se solape con este horario
        const detailStartDatetime =
          detail.detailStartDatetime ||
          createSessionWithDetailDto.startDatetime ||
          createSessionWithDetailDto.sessionDatetime;
        if (detailStartDatetime) {
          const workerConflict =
            await this.checkIfWorkerHasAppointmentAtSameTime(
              detail.companyWorkerId as number,
              detailStartDatetime,
              detailTime,
            );

          if (workerConflict) {
            const conflictStart = new Date(workerConflict.startDatetime);
            const workerName = companyWorker.worker
              ? (companyWorker.worker.name || '').trim()
              : `Trabajador ID: ${companyWorker.id}`;
            throw new BadRequestException(
              `El trabajador "${workerName}" ya tiene una cita asignada que se solapa con el horario seleccionado (${conflictStart.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIMEZONE })}). Por favor, seleccione otro horario o trabajador.`,
            );
          }
        }
      }

      // Cortesía: el detalle se presta sin cobrar. No se combina con oferta.
      const isCourtesy = detail.isCourtesy === true;
      if (isCourtesy && detail.offerId != null) {
        throw new BadRequestException(
          `El servicio "${service.name}" no puede ser cortesía y oferta a la vez`,
        );
      }

      // Resolver precio: oferta o normal
      const priceResolution = await this.resolveServicePrice(
        detail.serviceId,
        companyId,
        detail.offerId,
        createSessionWithDetailDto.sessionDatetime,
      );

      let serviceCostNumber: number;

      if (isCourtesy) {
        // Cortesía: precio 0, se ignora el costo configurado del servicio/worker.
        serviceCostNumber = 0;
        console.log(`🎁 Servicio "${service.name}" → CORTESÍA (precio 0)`);
      } else if (priceResolution.isOffer) {
        // Precio de la oferta (service_offer.price)
        serviceCostNumber = priceResolution.finalPrice;
        console.log(
          `🏷️ Servicio "${service.name}" → precio de OFERTA "${priceResolution.offerName}": ${serviceCostNumber}`,
        );
      } else {
        // Precio normal: costo por trabajador (CLYP-301) con fallback a
        // service.cost. worker.cost ?? service.cost.
        serviceCostNumber = this.resolveWorkerServiceCost(
          service,
          detail.companyWorkerId,
        );
        console.log(
          `💰 Servicio "${service.name}" → precio NORMAL (worker.cost ?? service.cost): ${serviceCostNumber}`,
        );
      }

      // Una cortesía sí puede quedar en 0; el resto debe ser > 0.
      if (!isCourtesy && serviceCostNumber <= 0) {
        throw new BadRequestException(
          `El costo del servicio "${service.name}" debe ser mayor a 0`,
        );
      }

      const calculatedAmounts = this.calculateAmounts(
        serviceCostNumber,
        workerPercentage,
        companyPercentage,
      );

      // Acumular totales - asegurando que sean números
      const detailCost = calculatedAmounts.cost;
      // const detailTime = service.standardTime || 0;

      totalSessionCost += detailCost;

      const workerName = companyWorker
        ? companyWorker.worker
          ? (companyWorker.worker.name || '').trim()
          : `Trabajador ID: ${companyWorker.id}`
        : 'Sin asignar';

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
        detailTime,
      });

      calculations.push({
        serviceId: detail.serviceId,
        serviceName: service.name || '',
        companyWorkerId: detail.companyWorkerId ?? null,
        workerName: workerName,
        totalCost: detailCost,
        totalTime: detailTime,
        workerPercentage,
        companyPercentage,
        totalWorker: calculatedAmounts.totalWorker,
        totalCompany: calculatedAmounts.totalCompany,
        calculationDetails: calculatedAmounts.calculationDetails,
        workerAssigned,
        // Info de oferta
        isOffer: priceResolution.isOffer,
        appliedOfferId: priceResolution.appliedOfferId,
        offerName: priceResolution.offerName,
        originalPrice: priceResolution.isOffer ? Number(service.cost) : null,
      });
    }

    // 5. Calcular tiempo total real considerando solapamiento entre servicios
    const defaultStartDatetime =
      createSessionWithDetailDto.startDatetime ||
      createSessionWithDetailDto.sessionDatetime ||
      new Date();
    totalSessionTime = this.calculateRealTotalTime(
      serviceValidations.map((v) => ({
        startDatetime: v.detail.detailStartDatetime || defaultStartDatetime,
        totalTime: v.detailTime,
      })),
    );

    // Si algún detalle quedó sin trabajador, la cita arranca en estado 8
    // (pendiente de asignación) salvo que el request especifique otro estado.
    const hasUnassignedDetail = serviceValidations.some(
      (v) =>
        v.detail.companyWorkerId === null ||
        v.detail.companyWorkerId === undefined,
    );
    const defaultSessionStatus = hasUnassignedDetail ? 8 : 1;

    // 6. Crear datos de la sesión con los totales calculados
    const sessionData: CreateSessionDto = {
      clientId: createSessionWithDetailDto.clientId,
      sessionDatetime: createSessionWithDetailDto.sessionDatetime,
      sessionStatus:
        createSessionWithDetailDto.sessionStatus !== undefined
          ? createSessionWithDetailDto.sessionStatus
          : defaultSessionStatus,
      totalCost: totalSessionCost,
      totalTime: totalSessionTime,
      iaResponse: createSessionWithDetailDto.iaResponse,
      startDatetime:
        createSessionWithDetailDto.startDatetime ||
        createSessionWithDetailDto.sessionDatetime ||
        new Date(),
      status:
        createSessionWithDetailDto.status !== undefined
          ? createSessionWithDetailDto.status
          : 1,
      description: createSessionWithDetailDto.description,
      descriptionIA: createSessionWithDetailDto.descriptionIA,
    };

    console.log('📝 Creando sesión con datos:', {
      clientId: sessionData.clientId,
      sessionDatetime: sessionData.sessionDatetime,
      startDatetime: sessionData.startDatetime,
      totalCost: sessionData.totalCost,
      totalTime: sessionData.totalTime,
    });

    // 6. Verificar si ya existe una sesión con los mismos datos
    const existingSession = await this.checkExistingSession(sessionData);

    if (existingSession) {
      const existingDetails: SessionDetail[] = [];

      for (const validation of serviceValidations) {
        // Los detalles sin worker no tienen una clave única para comparar;
        // siempre se consideran "nuevos" y no colisionan con detalles existentes.
        if (
          validation.detail.companyWorkerId === null ||
          validation.detail.companyWorkerId === undefined
        ) {
          continue;
        }
        const existingDetail = await this.checkExistingSessionDetail(
          existingSession.id,
          validation.detail.serviceId,
          validation.detail.companyWorkerId,
        );

        if (existingDetail) {
          existingDetails.push(existingDetail);
        }
      }

      if (
        existingDetails.length === createSessionWithDetailDto.details.length
      ) {
        throw new BadRequestException({
          message: `El cliente ya tiene una sesión con los mismos datos y todos los servicios ya están asignados.`,
          existingSession,
          existingDetails,
          recommendation:
            'Si desea modificar la sesión existente, use el endpoint de actualización.',
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
        existingSession: existingSession,
      };
    }

    // 7. Crear la sesión (con los totales ya calculados)
    const session = await this.create(sessionData, adminId);
    const isNew = true;
    const createdDetails: SessionDetail[] = [];

    // 8. Crear los detalles de sesión
    for (const validation of serviceValidations) {
      const { detail, service, calculatedAmounts, detailTime } = validation;

      // CLYP-311: persistir endDatetime (fin explícito o inicio + duración) para
      // que el calendario tenga el fin de cada servicio.
      const detailStart = detail.detailStartDatetime || session.startDatetime;
      const detailEnd = this.resolveDetailEnd(
        detailStart,
        detail.detailEndDatetime,
        detailTime,
      );

      const sessionDetailData: DeepPartial<SessionDetail> = {
        cost: calculatedAmounts.cost,
        serviceId: detail.serviceId,
        companyWorkerId: (detail.companyWorkerId ?? null) as unknown as number,
        sessionId: session.id,
        startDatetime: detailStart,
        totalTime: detailTime,
        endDatetime: detailEnd,
        // Hora agendada original: se fija aquí y no se mueve con Comenzar/
        // Terminar ni con el arrastre (ripple).
        originalStartDatetime: detailStart,
        originalEndDatetime: detailEnd,
        totalWorker: calculatedAmounts.totalWorker,
        totalCompany: calculatedAmounts.totalCompany,
        status: detail.detailStatus !== undefined ? detail.detailStatus : 1,
        offerId: detail.offerId ?? undefined,
        isCourtesy: detail.isCourtesy === true,
        description: detail.description ?? undefined,
        descriptionIA: detail.descriptionIA ?? undefined,
      };

      try {
        const sessionDetail =
          this.sessionDetailRepository.create(sessionDetailData);
        const savedSessionDetail =
          await this.sessionDetailRepository.save(sessionDetail);
        createdDetails.push(savedSessionDetail);
      } catch (error) {
        // Si falla algún detalle, eliminar todo lo creado
        if (createdDetails.length > 0) {
          await this.sessionDetailRepository.remove(createdDetails);
        }

        await this.sessionRepository.delete({
          id: session.id,
          clientId: session.clientId,
        });

        throw new BadRequestException(
          `Error al crear el detalle para el servicio ${service.name}: ${(error as Error).message}`,
        );
      }
    }

    // Correos de la cita (uno solo, con todos los servicios) en segundo plano.
    this.sendConfirmationEmails(
      session,
      createdDetails,
      createSessionWithDetailDto.clientId,
      companyId,
    ).catch((error) => {
      this.logger.error(
        `Error enviando correos de confirmación: ${(error as Error).message}`,
      );
    });

    // Actualizar automáticamente el estado de la sesión basado en los detalles
    try {
      await this.updateSessionStatusBasedOnDetails(session.id);
      console.log(
        `✅ Estado de sesión actualizado automáticamente basado en ${createdDetails.length} detalle(s)`,
      );
    } catch (error) {
      console.warn(
        `⚠️ No se pudo actualizar automáticamente el estado de la sesión: ${(error as Error).message}`,
      );
      // No lanzamos error para no romper el flujo, solo registramos advertencia
    }

    // 9. Verificar y actualizar las compañías del cliente
    let wasAlreadyAssociated = false;
    let companiesBefore: number[] = [];
    let companiesAfter: number[] = [];

    const client = await this.clientRepository.findOne({
      where: { id: createSessionWithDetailDto.clientId },
    });

    if (!client) {
      // Eliminar todo lo creado
      await this.sessionDetailRepository
        .createQueryBuilder()
        .delete()
        .where('sessionId = :sessionId', { sessionId: session.id })
        .execute();

      await this.sessionRepository.delete({
        id: session.id,
        clientId: session.clientId,
      });

      throw new NotFoundException(
        `Cliente con ID ${createSessionWithDetailDto.clientId} no encontrado`,
      );
    }

    companiesBefore = client.companies || [];
    const companyIds = companiesBefore.map((id) => Number(id));
    const targetCompanyId = Number(companyId);

    // Registrar la fecha de la primera cita del cliente con esta compañía.
    // Solo se guarda una vez (la PRIMERA cita); citas posteriores no la pisan.
    const firstAppointments = Array.isArray(client.companyFirstAppointments)
      ? client.companyFirstAppointments
      : [];
    const hasFirstAppointment = firstAppointments.some(
      (fa) => Number(fa.companyId) === targetCompanyId,
    );
    const updatedFirstAppointments = hasFirstAppointment
      ? firstAppointments
      : [
          ...firstAppointments,
          {
            companyId: targetCompanyId,
            firstAppointmentDate: session.startDatetime,
          },
        ];

    const isNewCompany = !companyIds.includes(targetCompanyId);
    const updatedCompanies = isNewCompany
      ? [...companiesBefore, targetCompanyId]
      : companiesBefore;
    companiesAfter = updatedCompanies;

    if (isNewCompany || !hasFirstAppointment) {
      await this.clientRepository.update(client.id, {
        companies: updatedCompanies,
        companyFirstAppointments: updatedFirstAppointments,
      });
    }

    if (isNewCompany) {
      wasAlreadyAssociated = false;
      console.log(`✅ Cliente ${client.id} asociado a compañía ${companyId}`);
    } else {
      wasAlreadyAssociated = true;
      console.log(
        `ℹ️ Cliente ${client.id} ya estaba asociado a compañía ${companyId}`,
      );
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
      createdDetails,
    };
  }

  /**
   * Verificar si el cliente ya tiene una cita en la misma fecha y hora
   * Opcional: Puedes agregar un margen de tiempo (ej: 30 minutos) para considerar "misma hora"
   */
  private async checkIfClientHasAppointmentAtSameTime(
    clientId: number,
    sessionDatetime: Date,
    companyId: number,
  ): Promise<Session | null> {
    if (!sessionDatetime) {
      return null;
    }

    // Día del negocio que contiene la cita (no la zona del servidor), para no
    // perder las citas de noche.
    const { startOfDay, endOfDay } =
      businessDayBoundsForInstant(sessionDatetime);

    // Margen de tiempo (ej: 30 minutos antes/después)
    const timeMarginMinutes = 30; // Puedes ajustar este valor

    // Buscar sesiones del cliente en el mismo día (excluyendo canceladas status=5)
    const sessionsSameDay = await this.sessionRepository.find({
      where: {
        clientId: clientId,
        sessionDatetime: Between(startOfDay, endOfDay),
        sessionStatus: Not(5),
      },
    });

    if (sessionsSameDay.length === 0) {
      return null;
    }

    // Verificar si alguna de las sesiones está en la misma hora (con margen)
    for (const session of sessionsSameDay) {
      const existingAppointmentTime = new Date(
        session.sessionDatetime,
      ).getTime();
      const newAppointmentTime = new Date(sessionDatetime).getTime();

      // Calcular diferencia en minutos
      const timeDifference =
        Math.abs(existingAppointmentTime - newAppointmentTime) / (1000 * 60);

      // Si la diferencia es menor al margen establecido, considerar que es la misma hora
      if (timeDifference <= timeMarginMinutes) {
        // Verificar también que la sesión pertenezca a la misma compañía
        // Para esto, necesitamos verificar los sessionDetails
        const sessionDetails = await this.sessionDetailRepository.find({
          where: { sessionId: session.id },
        });

        if (sessionDetails.length > 0) {
          // Verificar si algún detalle pertenece a la compañía actual
          for (const detail of sessionDetails) {
            const companyWorker = await this.companyWorkerRepository.findOne({
              where: { id: detail.companyWorkerId },
              relations: ['company'],
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
   * Devuelve los rangos OCUPADOS de una compañía en un día concreto, sin
   * exponer datos personales de otros clientes. Pensado para el rol cliente:
   * con esta info el front puede bloquear los slots ya tomados.
   *
   * Reglas:
   * - Filtra por `date` (día seleccionado).
   * - Si llega `companyWorkerId`: devuelve las citas de ese trabajador + las
   *   citas sin trabajador asignado (nivel company). NO incluye las de otros
   *   trabajadores (pueden atender en paralelo).
   * - Si no llega `companyWorkerId`: devuelve las de toda la compañía.
   * - Incluye citas de cualquier cliente, pero sin nombre ni datos del cliente.
   * - Excluye detalles cancelados (status 5).
   * - `startDatetime` se devuelve con la misma convención que el resto de la
   *   API (la app lee la hora con getUTCHours).
   */
  async getAvailability(getAvailabilityDto: {
    companyId: number;
    date: string;
    companyWorkerId?: number;
  }): Promise<
    Array<{
      companyWorkerId: number | null;
      startDatetime: Date;
      durationMinutes: number;
    }>
  > {
    const { companyId, date, companyWorkerId } = getAvailabilityDto;

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Compañía con ID ${companyId} no encontrada`);
    }

    // company_worker_ids activos de la compañía
    const companyWorkers = await this.companyWorkerRepository.find({
      where: { companyId, isActive: 1 },
      select: ['id'],
    });
    const companyWorkerIds = companyWorkers.map((cw) => cw.id);

    // Si se pidió un trabajador concreto, validar que pertenece a la compañía
    if (companyWorkerId && !companyWorkerIds.includes(companyWorkerId)) {
      throw new BadRequestException(
        `El trabajador ${companyWorkerId} no pertenece a la compañía ${companyId}`,
      );
    }

    // Rango del día seleccionado EN LA ZONA DEL NEGOCIO (misma convención que
    // el resto de filtros por fecha), para no perder las citas de noche.
    const { startOfDay, endOfDay } = businessDayBounds(date);

    // Se usa getMany() (entidades) en lugar de getRawMany() para que
    // `startDatetime` se serialice EXACTAMENTE igual que en el resto de la API.
    const query = this.sessionDetailRepository
      .createQueryBuilder('detail')
      .leftJoin('offer', 'offer', 'offer.id = detail.offer_id')
      .where('detail.start_datetime BETWEEN :startOfDay AND :endOfDay', {
        startOfDay,
        endOfDay,
      })
      // Solo se reportan como "Ocupado" las citas agendadas (1) o en proceso
      // (2). Las completadas (3) y pagadas (4) ya terminaron: no deben bloquear
      // el horario del cliente aunque sigan visibles en la agenda.
      .andWhere('detail.status NOT IN (:...blockingStatuses)', {
        blockingStatuses: [3, 4, 5],
      })
      .andWhere('detail.start_datetime IS NOT NULL');

    if (companyWorkerId) {
      // Citas del trabajador pedido + citas sin trabajador asignado (nivel company)
      query.andWhere(
        new Brackets((qb) => {
          qb.where('detail.company_worker_id = :companyWorkerId', {
            companyWorkerId,
          }).orWhere(
            '(detail.company_worker_id IS NULL AND offer.company_id = :companyId)',
            { companyId },
          );
        }),
      );
    } else {
      // Toda la compañía: trabajadores propios + detalles sin trabajador del company
      if (companyWorkerIds.length === 0) {
        // Sin trabajadores activos: solo pueden existir detalles a nivel company (ofertas)
        query.andWhere(
          '(detail.company_worker_id IS NULL AND offer.company_id = :companyId)',
          { companyId },
        );
      } else {
        query.andWhere(
          new Brackets((qb) => {
            qb.where('detail.company_worker_id IN (:...companyWorkerIds)', {
              companyWorkerIds,
            }).orWhere(
              '(detail.company_worker_id IS NULL AND offer.company_id = :companyId)',
              { companyId },
            );
          }),
        );
      }
    }

    const details = await query
      .orderBy('detail.start_datetime', 'ASC')
      .getMany();

    return details.map((detail) => ({
      companyWorkerId:
        detail.companyWorkerId !== null && detail.companyWorkerId !== undefined
          ? Number(detail.companyWorkerId)
          : null,
      startDatetime: detail.startDatetime,
      durationMinutes: Number(detail.totalTime || 0),
    }));
  }

  /**
   * Verificar si el trabajador ya tiene una cita que se solape con el horario propuesto.
   * Compara el rango [startDatetime, startDatetime + totalTime] contra los detalles existentes del trabajador.
   * Excluye detalles con status 5 (cancelados) y opcionalmente una sesión específica.
   */
  private async checkIfWorkerHasAppointmentAtSameTime(
    companyWorkerId: number,
    startDatetime: Date,
    totalTimeMinutes: number,
    excludeSessionId?: number,
  ): Promise<SessionDetail | null> {
    if (!startDatetime || !totalTimeMinutes) {
      return null;
    }

    const newStart = new Date(startDatetime).getTime();
    const newEnd = newStart + totalTimeMinutes * 60000;

    // Día del negocio que contiene la cita (no la zona del servidor): así el
    // pre-filtro no descarta las citas de noche antes de la comparación de
    // solape (que sí se hace por instantes, más abajo).
    const { startOfDay, endOfDay } = businessDayBoundsForInstant(startDatetime);

    // Buscar detalles del trabajador en el mismo día (excluyendo cancelados status=5)
    const workerDetails = await this.sessionDetailRepository
      .createQueryBuilder('sd')
      .where('sd.company_worker_id = :companyWorkerId', { companyWorkerId })
      .andWhere('sd.start_datetime BETWEEN :startOfDay AND :endOfDay', {
        startOfDay,
        endOfDay,
      })
      // Solo bloquean citas agendadas (1) o en proceso (2). Las completadas (3)
      // y pagadas (4) ya terminaron: el worker está libre y su tramo queda
      // disponible para agendar (aunque se solape visualmente con la ya cerrada).
      .andWhere('sd.status NOT IN (:...blockingStatuses)', {
        blockingStatuses: [3, 4, 5],
      })
      .getMany();

    for (const detail of workerDetails) {
      // Excluir detalles de la misma sesión (para no comparar consigo misma)
      if (excludeSessionId && detail.sessionId === excludeSessionId) {
        continue;
      }

      const existingStart = new Date(detail.startDatetime).getTime();
      const existingEnd = existingStart + (detail.totalTime || 0) * 60000;

      // Verificar solapamiento: newStart < existingEnd AND newEnd > existingStart
      if (newStart < existingEnd && newEnd > existingStart) {
        return detail;
      }
    }

    return null;
  }

  /**
   * Calcula el tiempo total real de una sesión considerando solapamiento entre servicios.
   * En lugar de sumar los tiempos individuales, calcula la unión de los rangos de tiempo.
   * Ejemplo: servicio 2:00-2:50 (50min) + servicio 2:10-3:10 (60min) → tiempo real = 70min (2:00-3:10)
   */
  private calculateRealTotalTime(
    details: Array<{ startDatetime: Date; totalTime: number }>,
  ): number {
    if (details.length === 0) return 0;
    if (details.length === 1) return details[0].totalTime;

    // Convertir a rangos [start, end] en milisegundos
    const ranges = details
      .map((d) => ({
        start: new Date(d.startDatetime).getTime(),
        end: new Date(d.startDatetime).getTime() + (d.totalTime || 0) * 60000,
      }))
      .sort((a, b) => a.start - b.start);

    // Merge de rangos solapados
    const merged: Array<{ start: number; end: number }> = [ranges[0]];

    for (let i = 1; i < ranges.length; i++) {
      const last = merged[merged.length - 1];
      if (ranges[i].start <= last.end) {
        // Solapamiento: extender el rango
        last.end = Math.max(last.end, ranges[i].end);
      } else {
        // Sin solapamiento: nuevo rango
        merged.push({ ...ranges[i] });
      }
    }

    // Sumar la duración de los rangos merged (en minutos)
    return merged.reduce(
      (total, range) => total + (range.end - range.start) / 60000,
      0,
    );
  }

  /**
   * Método alternativo más simple: Verificar si hay sesiones en el mismo día
   * (sin verificar margen de tiempo)
   */
  private async checkIfClientHasAppointmentOnSameDay(
    clientId: number,
    sessionDatetime: Date,
    companyId: number,
  ): Promise<Session | null> {
    if (!sessionDatetime) {
      return null;
    }

    const { startOfDay, endOfDay } =
      businessDayBoundsForInstant(sessionDatetime);

    // Buscar sesiones del cliente en el mismo día (excluyendo canceladas status=5)
    const sessions = await this.sessionRepository.find({
      where: {
        clientId: clientId,
        sessionDatetime: Between(startOfDay, endOfDay),
        sessionStatus: Not(5),
      },
      order: {
        sessionDatetime: 'ASC',
      },
    });

    if (sessions.length === 0) {
      return null;
    }

    // Verificar si alguna sesión pertenece a la misma compañía
    for (const session of sessions) {
      const sessionDetails = await this.sessionDetailRepository.find({
        where: { sessionId: session.id },
      });

      for (const detail of sessionDetails) {
        const companyWorker = await this.companyWorkerRepository.findOne({
          where: { id: detail.companyWorkerId },
          relations: ['company'],
        });

        if (companyWorker?.company?.id === companyId) {
          return session; // Encontramos una cita en la misma compañía el mismo día
        }
      }
    }

    return null;
  }

  private async checkExistingSession(
    createSessionDto: CreateSessionDto,
  ): Promise<Session | null> {
    if (!createSessionDto.clientId) {
      return null;
    }

    const whereConditions: any = {
      clientId: createSessionDto.clientId,
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
      where: whereConditions,
    });

    return existingSession;
  }

  async findSessionsByClientAndDate(
    clientId: number,
    sessionDatetime: Date,
  ): Promise<Session[]> {
    const { startOfDay, endOfDay } =
      businessDayBoundsForInstant(sessionDatetime);

    return await this.sessionRepository.find({
      where: {
        clientId: clientId,
        sessionDatetime: Between(startOfDay, endOfDay),
      },
      order: {
        sessionDatetime: 'ASC',
      },
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
  /**
   * Máximo de días permitido en un rango de fechas (startDate..endDate).
   * Evita que el calendario pida un año entero de golpe.
   */
  private readonly MAX_RANGE_DAYS = 62;

  /**
   * Resuelve un rango `startDate`..`endDate` (YYYY-MM-DD) a los instantes de la
   * medianoche del primer día y el fin del último día, EN LA ZONA DEL NEGOCIO.
   * Es INCLUSIVO en ambos extremos.
   *
   * Valida que endDate no sea anterior a startDate y que el rango no supere
   * MAX_RANGE_DAYS.
   */
  private resolveDateRange(
    startDate: string,
    endDate: string,
  ): { startOfDay: Date; endOfDay: Date } {
    const { startOfDay, endOfDay } = this.toInclusiveDayRange(
      startDate,
      endDate,
    );

    const days = inclusiveDayCount(startDate, endDate);
    if (days > this.MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `El rango de fechas no puede superar ${this.MAX_RANGE_DAYS} días (se solicitaron ${days}). Divide la consulta en tramos más cortos.`,
      );
    }

    return { startOfDay, endOfDay };
  }

  /**
   * Igual que `resolveDateRange` pero SIN el tope de días: límites del rango en
   * la ZONA DEL NEGOCIO, inclusivo en ambos extremos. Se usa donde el rango
   * puede ser legítimamente largo (p. ej. el historial de citas del cliente).
   */
  private toInclusiveDayRange(
    startDate: string,
    endDate: string,
  ): { startOfDay: Date; endOfDay: Date } {
    const { startOfDay, endOfDay } = businessRangeBounds(startDate, endDate);
    if (endOfDay < startOfDay) {
      throw new BadRequestException(
        'El rango es inválido: endDate no puede ser anterior a startDate',
      );
    }
    return { startOfDay, endOfDay };
  }

  private calculateRealTime(detail: SessionDetail): number {
    return this.calculateRealTimeRaw(
      detail.status,
      detail.startDatetime,
      detail.endDatetime,
    );
  }

  /**
   * Tiempo real (en minutos) de un servicio, calculado desde sus fechas de
   * inicio y fin. Solo aplica a servicios completados (status 3 o 4); en
   * cualquier otro caso devuelve 0. Sirve tanto para entidades como para filas
   * crudas (getRawMany).
   */
  private calculateRealTimeRaw(
    status: number | null | undefined,
    startDatetime: Date | string | null | undefined,
    endDatetime: Date | string | null | undefined,
  ): number {
    if ((status === 3 || status === 4) && startDatetime && endDatetime) {
      const start = new Date(startDatetime).getTime();
      const end = new Date(endDatetime).getTime();
      const minutes = (end - start) / 60000;
      return Math.round(minutes * 100) / 100; // redondear a 2 decimales
    }
    return 0; // si no tiene fechas o no está terminado
  }

  async findOneWithDetails(id: number): Promise<SessionResponse> {
    // Buscar la sesión por ID
    const session = await this.sessionRepository.findOne({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }

    // Obtener información del cliente
    const client = await this.clientRepository.findOne({
      where: { id: session.clientId },
    });

    if (!client) {
      throw new NotFoundException(
        `Client with id ${session.clientId} not found`,
      );
    }

    // Obtener TODOS los detalles de la sesión
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId: session.id },
    });

    // Variables para almacenar información general
    let companyId = 0;
    let companyName = 'Compañía no encontrada';
    let companyAddress: string | null = null;

    // Array para almacenar todos los detalles
    const details: SessionDetailResponse[] = [];

    // Variables para calcular totales
    let totalCost = 0;
    let totalTime = 0;
    let realTotalTime = 0;

    // Procesar CADA detalle de la sesión
    for (const detail of sessionDetails) {
      // Obtener información del servicio
      const service = await this.serviceRepository.findOne({
        where: { id: detail.serviceId },
      });

      // Obtener información del trabajador (solo si hay companyWorkerId asignado)
      const companyWorker = detail.companyWorkerId
        ? await this.companyWorkerRepository.findOne({
            where: { id: detail.companyWorkerId },
            relations: ['worker', 'company'],
          })
        : null;

      // Si es el primer detalle, tomar la compañía (asumimos que todos son de la misma compañía)
      if (companyId === 0 && companyWorker?.company) {
        companyId = companyWorker.company.id;
        companyName = companyWorker.company.name;
        companyAddress = companyWorker.company.address ?? null;
      }

      // Obtener información de la oferta (si el detalle tiene offer_id)
      const hasOffer = detail.offerId !== null && detail.offerId !== undefined;
      let offerObj: OfferDetailResponse | null = null;
      const originalPrice = Number(service?.cost ?? 0) || 0;
      const appliedPrice = Number(detail.cost ?? 0) || 0;

      if (hasOffer) {
        const offer = await this.offerRepository.findOne({
          where: { id: detail.offerId },
        });

        const serviceOffer = await this.serviceOfferRepository.findOne({
          where: { offerId: detail.offerId, serviceId: detail.serviceId },
        });

        if (offer) {
          const offerPrice = Number(serviceOffer?.price ?? 0) || 0;
          const discountAmount = Math.max(originalPrice - offerPrice, 0);
          const discountPercentage =
            originalPrice > 0
              ? parseFloat(((discountAmount / originalPrice) * 100).toFixed(2))
              : 0;

          offerObj = {
            id: offer.id,
            name: offer.name,
            description: offer.description ?? null,
            startDate: offer.startDate,
            endDate: offer.endDate,
            status: offer.status,
            logoUrl: offer.logo
              ? this.fileUploadService.getFileUrl('offer_logo', offer.logo)
              : null,
            originalPrice,
            offerPrice,
            discountAmount: parseFloat(discountAmount.toFixed(2)),
            discountPercentage,
          };
        }
      }
      const realTime = this.calculateRealTime(detail);

      // Agregar detalle al array (mismo shape que el listado de admin)
      details.push({
        detailId: detail.id,
        serviceId: detail.serviceId,
        serviceName: service?.name || 'Servicio no encontrado',
        serviceDescription: service?.description || '',
        serviceCost: Number(detail.cost || 0),
        currency: service?.currency ?? null,
        // Tiempo estimado del servicio definido por la compañía (en minutos)
        standardTime:
          service?.standardTime != null ? Number(service.standardTime) : null,
        // Tiempo planificado del trabajador para este servicio (en minutos)
        durationWorker: Number(detail.totalTime || 0),
        // Tiempo real del servicio (inicio→fin; 0 si no está completado)
        realDuration: realTime,
        startDatetime: detail.startDatetime,
        // CLYP-311 (B4): fin por detalle para el calendario.
        endDatetime: detail.endDatetime,
        // Hora agendada original (para mostrar "agendada X · movida a Y").
        originalStartDatetime: detail.originalStartDatetime,
        originalEndDatetime: detail.originalEndDatetime,
        companyWorkerId: detail.companyWorkerId,
        // worker.id REAL (para calificar). Distinto del companyWorkerId.
        workerId: companyWorker?.worker?.id ?? null,
        workerName: companyWorker?.worker
          ? (companyWorker.worker.name || '').trim()
          : '',
        originalPrice,
        appliedPrice,
        isOffer: hasOffer && offerObj !== null,
        offerId: hasOffer ? detail.offerId : null,
        offer: offerObj,
        totalWorker: Number(detail.totalWorker || 0),
        totalCompany: Number(detail.totalCompany || 0),
        detailStatus: detail.status || 1,
        detailStatusText: this.getDetailStatusText(detail.status || 1),
        isExtra: detail.isExtra === true || (detail.isExtra as any) === 1,
        isCourtesy:
          detail.isCourtesy === true || (detail.isCourtesy as any) === 1,
        description: detail.description ?? null,
        descriptionIA: detail.descriptionIA ?? null,
        descriptionWorker: detail.descriptionWorker ?? null,
        cancelReason: detail.cancelReason ?? null,
        cancelledBy: detail.cancelledBy ?? null,
        cancelledByText: this.getCancelledByText(detail.cancelledBy),
      });

      // Acumular totales
      totalCost += appliedPrice;
      totalTime += Number(detail.totalTime || 0);
      realTotalTime += realTime;
    }

    // Si no se encontró información de compañía en los detalles
    if (companyName === 'Compañía no encontrada') {
      if (client.companies && client.companies.length > 0) {
        const firstCompanyId = client.companies[0];
        const company = await this.companyRepository.findOne({
          where: { id: firstCompanyId },
        });

        if (company) {
          companyId = company.id;
          companyName = company.name;
          companyAddress = company.address ?? null;
        }
      }
    }

    // Construir la respuesta (mismo shape que el listado de admin)
    const response: SessionResponse = {
      id: session.id,
      clientId: session.clientId,
      clientName: `${client.name || ''} ${client.lastName || ''}`.trim(),
      clientLastName: client.lastName || '',
      clientPicture: client.picture
        ? this.fileUploadService.getFileUrl('client_photo', client.picture)
        : null,
      companyId: companyId,
      companyName: companyName,
      // Dirección de la cita (dirección de la compañía)
      address: companyAddress,
      sessionDatetime: session.sessionDatetime,
      sessionStatus: session.sessionStatus,
      sessionStatusText: this.getSessionStatusText(session.sessionStatus),
      totalCost: totalCost,
      // Tiempo estimado total del trabajador para la cita (suma de durationWorker)
      workerEstimateTime: totalTime,
      // Duración real total de la cita (suma de realDuration de cada servicio)
      realTotalTime: parseFloat(realTotalTime.toFixed(2)),
      startDatetime: session.startDatetime || session.sessionDatetime,
      // Hora agendada original de la cita (para la tarjeta).
      originalStartDatetime:
        session.originalStartDatetime || session.sessionDatetime,
      status: session.status || 1,
      iaResponse: session.iaResponse,
      servicesCount: details.length,
      services: details,
      extraServices: session.extraServices || [],
      // Cobro registrado (POST /sessions/:id/payment); null si aún no se cobró.
      payment: await this.getSessionPaymentResponse(session.id),
      cancellationReason: session.cancellationReason ?? null,
      cancelledBy: session.cancelledBy ?? null,
      cancelledByText: this.getCancelledByText(session.cancelledBy),
      createdAt: (session as any).createdAt || null,
      updatedAt: (session as any).updatedAt || null,
      // B1: estado de calificación del cliente para esta cita (aditivo). La
      // reseña se guarda por userId; session.clientId es el client.id, así que
      // se resuelve el userId del dueño de la cita.
      feedback: await this.getSessionFeedbackForClient(
        session.clientId,
        session.id,
      ),
    };

    return response;
  }

  /** Resuelve el userId del cliente (client.id) y arma el objeto feedback (B1). */
  private async getSessionFeedbackForClient(
    clientEntityId: number,
    sessionId: number,
  ) {
    const client = await this.clientRepository.findOne({
      where: { id: clientEntityId },
      select: ['id', 'userId'],
    });
    if (!client?.userId) return null;
    return this.feedbacksService.getSessionFeedback(client.userId, sessionId);
  }

  async updateSessionDates(
    sessionId: number,
    updateSessionDto: UpdateSessionDto,
    adminId: number,
  ): Promise<{
    session: Session;
    updatedDetails: number;
    message: string;
  }> {
    console.log(
      `🔄 Actualizando fechas de sesión ${sessionId} y todos sus detalles`,
    );

    // 1. Verificar permisos
    const adminCompany = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!adminCompany) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    // 2. Buscar la sesión
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // 3. Buscar TODOS los detalles de la sesión
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId: sessionId },
    });

    if (sessionDetails.length === 0) {
      throw new NotFoundException(
        `No se encontraron detalles para la sesión ${sessionId}`,
      );
    }

    const queryRunner =
      this.sessionRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 4. Actualizar fecha de la sesión
      let newSessionDatetime = session.sessionDatetime;

      if (updateSessionDto.sessionDatetime !== undefined) {
        newSessionDatetime = new Date(updateSessionDto.sessionDatetime);

        await queryRunner.manager.update(
          Session,
          { id: sessionId, clientId: session.clientId },
          {
            sessionDatetime: newSessionDatetime,
            startDatetime: newSessionDatetime,
          },
        );
        console.log(`✅ Fecha de sesión actualizada a ${newSessionDatetime}`);
      }

      // 5. Actualizar fechas de TODOS los detalles
      let updatedCount = 0;
      for (const detail of sessionDetails) {
        const updateData: Partial<SessionDetail> = {};

        // Si se proporciona detailStartDatetime específico para este detalle
        if (
          updateSessionDto.detailStartDatetime !== undefined &&
          detail.id === updateSessionDto.detailId
        ) {
          updateData.startDatetime = new Date(
            updateSessionDto.detailStartDatetime,
          );
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
              sessionId: detail.sessionId,
            },
            updateData,
          );
          updatedCount++;
        }
      }

      await queryRunner.commitTransaction();

      // 6. Verificar que la sesión aún existe después de la transacción
      const finalSession = await this.sessionRepository.findOne({
        where: { id: sessionId },
      });

      if (!finalSession) {
        throw new NotFoundException(
          `Sesión con ID ${sessionId} no encontrada después de la actualización`,
        );
      }

      return {
        session: finalSession,
        updatedDetails: updatedCount,
        message: `Fechas actualizadas exitosamente. ${updatedCount} detalle(s) modificado(s).`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Error al actualizar fechas: ${(error as Error).message}`,
      );
    } finally {
      await queryRunner.release();
    }
  }
  async removeSessionWithDetails(
    sessionId: number,
  ): Promise<{ message: string }> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    await this.sessionDetailRepository
      .createQueryBuilder()
      .delete()
      .where('sessionId = :sessionId', { sessionId: sessionId })
      .execute();

    // CORRECCIÓN: Eliminar con PK compuesta
    await this.sessionRepository.delete({
      id: session.id,
      clientId: session.clientId,
    });

    return {
      message: `Sesión eliminada Exitosamente`,
    };
  }

  async remove(
    id: number,
    adminId?: number,
  ): Promise<{ message: string; deletedSession: SessionResponse }> {
    const session = await this.sessionRepository.findOne({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }

    if (adminId) {
      const adminCompany = await this.companyRepository.findOne({
        where: { userId: adminId },
      });

      if (!adminCompany) {
        throw new NotFoundException(
          'El administrador no tiene una compañía asignada',
        );
      }

      const sessionDetails = await this.sessionDetailRepository.find({
        where: { sessionId: id },
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
        throw new BadRequestException(
          'No tienes permiso para eliminar esta sesión',
        );
      }
    }

    const sessionInfo = await this.findOneWithDetails(id);

    await this.sessionDetailRepository
      .createQueryBuilder()
      .delete()
      .where('sessionId = :sessionId', { sessionId: id })
      .execute();

    // CORRECCIÓN: Eliminar con PK compuesta
    const result = await this.sessionRepository.delete({
      id: session.id,
      clientId: session.clientId,
    });

    if (result.affected === 0) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }

    return {
      message: `Sesión ${id} eliminada exitosamente`,
      deletedSession: sessionInfo,
    };
  }

  async debugClient(clientId: number): Promise<any> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
      select: ['id', 'name', 'lastName', 'email', 'companies'],
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
      companiesJSON: JSON.stringify(client.companies),
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
          `El porcentaje general del servicio ${service.id} no es válido (${percentage}%). Debe estar entre 0 y 100`,
        );
      }
    }

    if (
      service.workers &&
      Array.isArray(service.workers) &&
      service.workers.length > 0
    ) {
      service.workers.forEach((worker) => {
        if (worker.percentage < 0 || worker.percentage > 100) {
          throw new BadRequestException(
            `El porcentaje del worker ${worker.id} en el servicio ${service.id} no es válido (${worker.percentage}%). Debe estar entre 0 y 100`,
          );
        }

        // Validar tiempo si existe (debe ser un número positivo)
        if (worker.time !== undefined && worker.time !== null) {
          const time = Number(worker.time);
          if (time < 0) {
            throw new BadRequestException(
              `El tiempo del worker ${worker.id} en el servicio ${service.id} no es válido (${time} minutos). Debe ser un número positivo`,
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
          `El tiempo general del servicio ${service.id} no es válido (${standardTime} minutos). Debe ser un número positivo`,
        );
      }
    }

    const hasGeneralPercentage =
      service.percentage !== undefined && service.percentage !== null;
    const hasSpecificWorkers =
      service.workers &&
      Array.isArray(service.workers) &&
      service.workers.length > 0;

    if (!hasGeneralPercentage && !hasSpecificWorkers) {
      throw new BadRequestException(
        `El servicio ${service.id} no tiene configurado el porcentaje.`,
      );
    }
  }

  /**
   * Correos de una cita: UNO al cliente con todos sus servicios, UNO por
   * trabajador (sólo con los servicios que le tocan) y UNO al administrador.
   * Antes se enviaba un correo por servicio, así que una cita de 2+ servicios
   * llenaba la bandeja de correos casi idénticos.
   *
   * Best-effort: nunca rompe la creación de la cita.
   */
  private async sendConfirmationEmails(
    session: Session,
    details: SessionDetail[],
    clientId: number,
    companyId: number,
  ): Promise<void> {
    try {
      if (!details || details.length === 0) return;
      // Como antes: si NINGÚN servicio tiene trabajador, la cita está pendiente
      // de asignación y todavía no se notifica a nadie.
      if (!details.some((d) => !!d.companyWorkerId)) return;

      const clientInfo = await this.getClientInfo(clientId);
      const company = await this.companyRepository.findOne({
        where: { id: companyId },
      });
      const companyInfo = {
        name: company?.name || '',
        address: company?.location || '',
        email: company?.email || '',
      };

      // Servicios y trabajadores de todos los detalles, en una sola consulta.
      const services = await this.serviceRepository.find({
        where: [...new Set(details.map((d) => d.serviceId))].map((id) => ({
          id,
        })),
      });
      const serviceById = new Map(services.map((s) => [s.id, s]));

      const workerIds = [
        ...new Set(
          details
            .map((d) => d.companyWorkerId)
            .filter((id): id is number => !!id),
        ),
      ];
      const workerById = new Map<
        number,
        { email: string; name: string; phone: string }
      >();
      for (const workerId of workerIds) {
        try {
          workerById.set(workerId, await this.getWorkerInfo(workerId));
        } catch (error) {
          this.logger.warn(
            `⚠️ No se pudo resolver el trabajador ${workerId} para los correos: ${(error as Error).message}`,
          );
        }
      }

      // Un item por servicio, ordenados por hora de inicio.
      const sorted = [...details].sort(
        (a, b) =>
          new Date(a.startDatetime || session.sessionDatetime).getTime() -
          new Date(b.startDatetime || session.sessionDatetime).getTime(),
      );
      const items = sorted.map((detail) => {
        const service = serviceById.get(detail.serviceId);
        const start = detail.startDatetime || session.sessionDatetime;
        return {
          detail,
          service: {
            name: service?.name || 'Servicio',
            time: this.emailService.formatSessionDate(start).time,
            duration:
              Number(detail.totalTime) || Number(service?.standardTime) || 0,
            cost:
              parseFloat(String(detail.cost)) ||
              parseFloat(String(service?.cost)) ||
              0,
            currency: service?.currency,
            workerName: detail.companyWorkerId
              ? workerById.get(detail.companyWorkerId)?.name
              : 'Por asignar',
          },
        };
      });

      const firstStart = sorted[0].startDatetime || session.sessionDatetime;
      const formattedDate = this.emailService.formatSessionDate(firstStart);
      const allServices = items.map((i) => i.service);
      const totalCost = allServices.reduce((sum, s) => sum + s.cost, 0);
      const totalDuration =
        Number(session.totalTime) ||
        allServices.reduce((sum, s) => sum + s.duration, 0);
      const currency = allServices[0]?.currency;
      // Profesionales de la cita (sin repetir) para la tarjeta del cliente.
      const workerNames = [
        ...new Set(allServices.map((s) => s.workerName).filter(Boolean)),
      ] as string[];

      if (clientInfo.email) {
        await this.emailService.sendSessionConfirmationToClient(
          clientInfo.email,
          clientInfo.name,
          {
            date: formattedDate.date,
            time: formattedDate.time,
            services: allServices,
            totalCost,
            totalDuration,
            currency,
          },
          {
            name: workerNames.join(', ') || 'Por asignar',
            phone:
              workerIds.length === 1
                ? workerById.get(workerIds[0])?.phone
                : undefined,
          },
          companyInfo,
        );
        this.logger.log(
          `✅ Correo de confirmación enviado al cliente: ${clientInfo.email} (${allServices.length} servicio(s))`,
        );
      }

      // Un correo por trabajador, sólo con SUS servicios.
      for (const workerId of workerIds) {
        const workerInfo = workerById.get(workerId);
        if (!workerInfo?.email) continue;

        const workerServices = items
          .filter((i) => i.detail.companyWorkerId === workerId)
          .map((i) => ({ ...i.service, workerName: undefined }));
        if (workerServices.length === 0) continue;

        await this.emailService.sendSessionNotificationToWorker(
          workerInfo.email,
          workerInfo.name,
          {
            date: formattedDate.date,
            time: workerServices[0].time,
            services: workerServices,
            totalCost: workerServices.reduce((sum, s) => sum + s.cost, 0),
            totalDuration: workerServices.reduce(
              (sum, s) => sum + s.duration,
              0,
            ),
            currency: workerServices[0].currency,
            clientName: clientInfo.name,
            clientPhone: clientInfo.phone,
          },
          {
            name: clientInfo.name,
            phone: clientInfo.phone,
          },
          companyInfo,
        );
        this.logger.log(
          `✅ Correo de notificación enviado al trabajador: ${workerInfo.email} (${workerServices.length} servicio(s))`,
        );
      }

      // Notificación al administrador de la empresa (una por cita).
      if (company?.userId) {
        const adminUser = await this.userRepository.findOne({
          where: { id: company.userId },
        });

        if (adminUser?.email) {
          await this.emailService.sendSessionNotificationToAdmin(
            adminUser.email,
            company.managerName || adminUser.username || 'Administrador',
            {
              date: formattedDate.date,
              time: formattedDate.time,
              services: allServices,
              totalCost,
              totalDuration,
              currency,
            },
            {
              name: clientInfo.name,
              email: clientInfo.email,
              phone: clientInfo.phone,
            },
            // Una ficha por trabajador de la cita (nombre + teléfono + email).
            workerIds
              .map((id) => workerById.get(id))
              .filter((worker) => !!worker)
              .map((worker) => ({
                name: worker.name,
                email: worker.email || undefined,
                phone: worker.phone || undefined,
              })),
            companyInfo,
          );
          this.logger.log(
            `✅ Correo de notificación enviado al administrador: ${adminUser.email}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `❌ Error enviando correos de confirmación: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  private async getWorkerInfo(companyWorkerId: number): Promise<{
    email: string;
    name: string;
    phone: string;
  }> {
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: { id: companyWorkerId },
      relations: ['worker', 'worker.user'],
    });

    if (!companyWorker || !companyWorker.worker) {
      throw new NotFoundException(
        `Trabajador con ID ${companyWorkerId} no encontrado`,
      );
    }

    const worker = companyWorker.worker;
    const user = await this.userRepository.findOne({
      where: { id: worker.userId },
    });

    return {
      email: user?.email || '',
      name: (worker.name || '').trim() || user?.username || 'Trabajador',
      phone: worker.phone || '',
    };
  }

  private async getClientInfo(clientId: number): Promise<{
    email: string;
    name: string;
    phone: string;
  }> {
    const client = await this.clientRepository.findOne({
      where: { id: clientId },
      relations: ['user'],
    });

    if (!client) {
      throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
    }

    const user = await this.userRepository.findOne({
      where: { id: client.userId },
    });

    return {
      email: client.email || user?.email || '',
      name:
        `${client.name || ''} ${client.lastName || ''}`.trim() ||
        user?.username ||
        'Cliente',
      phone: client.phone || '',
    };
  }

  async findAllSessionsSimple(
    adminId: number,
    getSessionsDto: GetSessionsDto,
  ): Promise<PaginationResult<any>> {
    console.log(
      `🔍 findAllSessionsSimple called with adminId=${adminId}, dto=`,
      JSON.stringify(getSessionsDto),
    );
    try {
      const adminCompany = await this.companyRepository.findOne({
        where: { userId: adminId },
      });

      if (!adminCompany) {
        throw new NotFoundException(
          'El administrador no tiene una compañía asignada',
        );
      }

      // 1. Obtener los company_worker_ids de la compañía
      const companyWorkers = await this.companyWorkerRepository.find({
        where: {
          companyId: adminCompany.id,
          isActive: 1,
        },
        select: ['id'],
      });

      const companyWorkerIds = companyWorkers.map((cw) => cw.id);

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
          },
        };
      }

      // 2. Buscar sessionIds que tienen detalles con estos company_worker_ids
      //    O detalles sin worker cuya oferta pertenezca a la misma compañía
      //    (caso "pendiente de asignación de trabajador").
      const sessionIdsQuery = this.sessionDetailRepository
        .createQueryBuilder('detail')
        .leftJoin('offer', 'offer', 'offer.id = detail.offer_id')
        .select('DISTINCT detail.session_id', 'sessionId')
        .where(
          '(detail.company_worker_id IN (:...companyWorkerIds) OR (detail.company_worker_id IS NULL AND offer.company_id = :adminCompanyId))',
          { companyWorkerIds, adminCompanyId: adminCompany.id },
        );

      const sessionIdsResult = await sessionIdsQuery.getRawMany();
      const sessionIds = sessionIdsResult.map((result) => result.sessionId);

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
          },
        };
      }

      // 3. Construir condiciones where para las sesiones
      const whereConditions: any = {
        id: In(sessionIds),
      };

      // ===================================================================
      // FILTROS DE FECHA
      // ===================================================================

      // PRIORIDAD 1: Filtrar por un día específico (en la zona del negocio)
      if (getSessionsDto.date) {
        const { startOfDay, endOfDay } = businessDayBounds(getSessionsDto.date);
        whereConditions.sessionDatetime = Between(startOfDay, endOfDay);
        console.log(
          `📅 Filtrando por fecha: ${getSessionsDto.date} (${startOfDay.toISOString()} - ${endOfDay.toISOString()})`,
        );
      }
      // PRIORIDAD 2: Filtrar por día de hoy (en la zona del negocio)
      else if (getSessionsDto.today) {
        const { startOfDay, endOfDay } = businessDayBounds(businessToday());
        whereConditions.sessionDatetime = Between(startOfDay, endOfDay);
        console.log(`📅 Filtrando por día actual (${businessToday()})`);
      }
      // PRIORIDAD 3: Filtrar por rango de fechas (inclusivo en ambos extremos)
      else if (getSessionsDto.startDate && getSessionsDto.endDate) {
        const { startOfDay, endOfDay } = this.resolveDateRange(
          getSessionsDto.startDate,
          getSessionsDto.endDate,
        );
        whereConditions.sessionDatetime = Between(startOfDay, endOfDay);
        console.log(
          `📅 Filtrando por rango: ${getSessionsDto.startDate} - ${getSessionsDto.endDate}`,
        );
      }

      // ===================================================================
      // FILTROS DE ESTADO
      // ===================================================================

      if (getSessionsDto.onlyScheduled) {
        whereConditions.sessionStatus = 1;
        console.log(`📋 Filtrando solo citas agendadas (sessionStatus = 1)`);
      } else if (
        getSessionsDto.sessionStatus &&
        getSessionsDto.sessionStatus.length > 0
      ) {
        whereConditions.sessionStatus =
          getSessionsDto.sessionStatus.length === 1
            ? getSessionsDto.sessionStatus[0]
            : In(getSessionsDto.sessionStatus);
      }

      if (getSessionsDto.clientId) {
        whereConditions.clientId = getSessionsDto.clientId;
      }

      // Determinar ordenamiento
      let order: any = {};
      if (getSessionsDto.today) {
        order = { sessionDatetime: 'ASC' };
      } else {
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
      }

      // 4. Obtener las sesiones con filtros aplicados
      const [sessions, total] = await this.sessionRepository.findAndCount({
        where: whereConditions,
        order: order,
        skip: (getSessionsDto.page - 1) * getSessionsDto.limit,
        take: getSessionsDto.limit,
      });

      // Estado de cobro (deuda) de las citas de esta página, en batch.
      const paymentStatusMap = await this.getPaymentStatusMap(
        sessions.map((s) => s.id),
      );

      // 5. Enriquecer los datos (resto del código permanece igual)
      const enrichedSessions = await Promise.all(
        sessions.map(async (session) => {
          const client = await this.clientRepository.findOne({
            where: { id: session.clientId },
          });

          // Incluir detalles con worker de la compañía O detalles sin worker
          // cuya oferta pertenezca a la compañía (pendientes de asignación).
          const sessionDetails = await this.sessionDetailRepository
            .createQueryBuilder('detail')
            .leftJoin('offer', 'offer', 'offer.id = detail.offer_id')
            .where('detail.session_id = :sessionId', { sessionId: session.id })
            .andWhere(
              '(detail.company_worker_id IN (:...companyWorkerIds) OR (detail.company_worker_id IS NULL AND offer.company_id = :adminCompanyId))',
              { companyWorkerIds, adminCompanyId: adminCompany.id },
            )
            .getMany();

          const services: any[] = [];
          let totalCost = 0;
          let totalTime = 0;
          let realTotalTime = 0;

          if (sessionDetails.length > 0) {
            for (const detail of sessionDetails) {
              const companyWorker = detail.companyWorkerId
                ? await this.companyWorkerRepository.findOne({
                    where: { id: detail.companyWorkerId },
                    relations: ['worker', 'company'],
                  })
                : null;

              const service = await this.serviceRepository.findOne({
                where: { id: detail.serviceId },
              });

              // Información de la oferta aplicada al detalle (si la hay)
              const hasOffer =
                detail.offerId !== null && detail.offerId !== undefined;
              const originalPrice = Number(service?.cost ?? 0) || 0;
              const appliedPrice = Number(detail.cost ?? 0) || 0;
              let offerObj: any = null;

              if (hasOffer) {
                const offer = await this.offerRepository.findOne({
                  where: { id: detail.offerId },
                });

                const serviceOffer = await this.serviceOfferRepository.findOne({
                  where: {
                    offerId: detail.offerId,
                    serviceId: detail.serviceId,
                  },
                });

                if (offer) {
                  const offerPrice = Number(serviceOffer?.price ?? 0) || 0;
                  const discountAmount = Math.max(
                    originalPrice - offerPrice,
                    0,
                  );
                  const discountPercentage =
                    originalPrice > 0
                      ? parseFloat(
                          ((discountAmount / originalPrice) * 100).toFixed(2),
                        )
                      : 0;

                  offerObj = {
                    id: offer.id,
                    name: offer.name,
                    description: offer.description ?? null,
                    startDate: offer.startDate,
                    endDate: offer.endDate,
                    status: offer.status,
                    logoUrl: offer.logo
                      ? this.fileUploadService.getFileUrl(
                          'offer_logo',
                          offer.logo,
                        )
                      : null,
                    originalPrice,
                    offerPrice,
                    discountAmount: parseFloat(discountAmount.toFixed(2)),
                    discountPercentage,
                  };
                }
              }
              const realTime = this.calculateRealTime(detail);

              services.push({
                detailId: detail.id,
                serviceId: detail.serviceId,
                serviceName: service?.name || '',
                serviceDescription: service?.description || '',
                serviceCost: Number(detail.cost || 0),
                currency: service?.currency ?? null,
                // Tiempo estimado del servicio definido por la compañía (en minutos)
                standardTime:
                  service?.standardTime != null
                    ? Number(service.standardTime)
                    : null,
                // Tiempo planificado del trabajador para este servicio (en minutos)
                durationWorker: Number(detail.totalTime || 0),
                // Tiempo real del servicio (inicio→fin; 0 si no está completado)
                realDuration: realTime,
                startDatetime: detail.startDatetime,
                // CLYP-311 (B4): fin por detalle para el calendario.
                endDatetime: detail.endDatetime,
                // Hora agendada original (para "agendada X · movida a Y").
                originalStartDatetime: detail.originalStartDatetime,
                originalEndDatetime: detail.originalEndDatetime,
                companyWorkerId: detail.companyWorkerId,
                workerName: companyWorker?.worker
                  ? (companyWorker.worker.name || '').trim()
                  : '',
                originalPrice,
                appliedPrice,
                isOffer: hasOffer && offerObj !== null,
                offerId: hasOffer ? detail.offerId : null,
                offer: offerObj,
                totalWorker: Number(detail.totalWorker || 0),
                totalCompany: Number(detail.totalCompany || 0),
                detailStatus: detail.status || 1,
                detailStatusText: this.getDetailStatusText(detail.status || 1),
                isExtra:
                  detail.isExtra === true || (detail.isExtra as any) === 1,
                isCourtesy:
                  detail.isCourtesy === true ||
                  (detail.isCourtesy as any) === 1,
                description: detail.description ?? null,
                descriptionIA: detail.descriptionIA ?? null,
                descriptionWorker: detail.descriptionWorker ?? null,
                cancelReason: detail.cancelReason ?? null,
                cancelledBy: detail.cancelledBy ?? null,
                cancelledByText: this.getCancelledByText(detail.cancelledBy),
              });

              totalCost += Number(detail.cost || 0);
              totalTime += Number(detail.totalTime || 0);
              realTotalTime += realTime;
            }
          }

          return {
            id: session.id,
            clientId: session.clientId,
            clientName: client
              ? `${client.name || ''} ${client.lastName || ''}`.trim()
              : 'Cliente no encontrado',
            clientLastName: client?.lastName || '',
            clientPicture: client?.picture
              ? this.fileUploadService.getFileUrl(
                  'client_photo',
                  client.picture,
                )
              : null,
            companyId: adminCompany.id,
            companyName: adminCompany.name,
            // Dirección de la cita (dirección de la compañía)
            address: adminCompany.address ?? null,
            sessionDatetime: session.sessionDatetime,
            sessionStatus: session.sessionStatus,
            sessionStatusText: this.getSessionStatusText(session.sessionStatus),
            totalCost: totalCost,
            // Tiempo estimado total del trabajador para la cita (suma de durationWorker)
            workerEstimateTime: totalTime,
            // Duración real total de la cita (suma de realDuration de cada servicio)
            realTotalTime: parseFloat(realTotalTime.toFixed(2)),
            startDatetime: session.startDatetime,
            status: session.status,
            iaResponse: session.iaResponse,
            servicesCount: sessionDetails.length,
            services: services,
            extraServices: session.extraServices || [],
            cancellationReason: session.cancellationReason ?? null,
            cancelledBy: session.cancelledBy ?? null,
            cancelledByText: this.getCancelledByText(session.cancelledBy),
            // Estado de cobro para el badge "En deuda" en Kanban/historial/calendario.
            isPaid: paymentStatusMap.get(session.id)?.isPaid ?? false,
            pendingCollection:
              paymentStatusMap.get(session.id)?.pendingCollection ?? false,
            collectedAt: paymentStatusMap.get(session.id)?.collectedAt ?? null,
            createdAt: session['createdAt'] || null,
            updatedAt: session['updatedAt'] || null,
          };
        }),
      );

      const result = {
        data: enrichedSessions,
        meta: {
          page: getSessionsDto.page,
          limit: getSessionsDto.limit,
          total: total,
          totalPages: Math.ceil(total / getSessionsDto.limit),
          hasNext:
            getSessionsDto.page < Math.ceil(total / getSessionsDto.limit),
          hasPrev: getSessionsDto.page > 1,
        },
      };
      console.log(
        `✅ findAllSessionsSimple returning ${enrichedSessions.length} sessions`,
      );
      return result;
    } catch (error) {
      console.error(
        `❌ findAllSessionsSimple ERROR:`,
        error.message,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Obtiene todas las citas de una compañía específica.
   * - Si el rol es 'adm': el usuario debe ser dueño de la compañía.
   * - Si el rol es 'cli': la compañía debe estar dentro de `client.companies`.
   */
  async findAllSessionsByCompany(
    companyId: number,
    getSessionsDto: GetSessionsDto,
    userId: number,
    userRole: string,
  ): Promise<PaginationResult<any>> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Compañía con ID ${companyId} no encontrada`);
    }

    if (userRole === 'adm') {
      if (company.userId !== userId) {
        throw new ForbiddenException(
          'No tienes acceso a las citas de esta compañía',
        );
      }
    } else if (userRole === 'cli') {
      const client = await this.clientRepository.findOne({
        where: { userId },
      });
      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }
      const allowed = (client.companies ?? [])
        .map((v: any) => Number(v))
        .includes(companyId);
      if (!allowed) {
        throw new ForbiddenException(
          'No tienes acceso a las citas de esta compañía',
        );
      }
    } else {
      throw new ForbiddenException('Rol no autorizado');
    }

    // 1. company_worker_ids activos de la compañía
    const companyWorkers = await this.companyWorkerRepository.find({
      where: { companyId, isActive: 1 },
      select: ['id'],
    });
    const companyWorkerIds = companyWorkers.map((cw) => cw.id);

    const emptyResult: PaginationResult<any> = {
      data: [],
      meta: {
        page: getSessionsDto.page,
        limit: getSessionsDto.limit,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    };

    if (companyWorkerIds.length === 0) {
      return emptyResult;
    }

    // 2. sessionIds vinculados a la compañía (worker propio o detalle pendiente)
    const sessionIdsResult = await this.sessionDetailRepository
      .createQueryBuilder('detail')
      .leftJoin('offer', 'offer', 'offer.id = detail.offer_id')
      .select('DISTINCT detail.session_id', 'sessionId')
      .where(
        '(detail.company_worker_id IN (:...companyWorkerIds) OR (detail.company_worker_id IS NULL AND offer.company_id = :companyId))',
        { companyWorkerIds, companyId },
      )
      .getRawMany();

    const sessionIds = sessionIdsResult.map((r) => r.sessionId);
    if (sessionIds.length === 0) {
      return emptyResult;
    }

    // 3. Filtros (mismas reglas que findAllSessionsSimple)
    const whereConditions: any = { id: In(sessionIds) };

    if (getSessionsDto.date) {
      const { startOfDay, endOfDay } = businessDayBounds(getSessionsDto.date);
      whereConditions.sessionDatetime = Between(startOfDay, endOfDay);
    } else if (getSessionsDto.today) {
      const { startOfDay, endOfDay } = businessDayBounds(businessToday());
      whereConditions.sessionDatetime = Between(startOfDay, endOfDay);
    } else if (getSessionsDto.startDate && getSessionsDto.endDate) {
      const { startOfDay, endOfDay } = this.resolveDateRange(
        getSessionsDto.startDate,
        getSessionsDto.endDate,
      );
      whereConditions.sessionDatetime = Between(startOfDay, endOfDay);
    }

    if (getSessionsDto.onlyScheduled) {
      whereConditions.sessionStatus = 1;
    } else if (
      getSessionsDto.sessionStatus &&
      getSessionsDto.sessionStatus.length > 0
    ) {
      whereConditions.sessionStatus =
        getSessionsDto.sessionStatus.length === 1
          ? getSessionsDto.sessionStatus[0]
          : In(getSessionsDto.sessionStatus);
    }

    if (getSessionsDto.clientId) {
      whereConditions.clientId = getSessionsDto.clientId;
    }

    let order: any;
    if (getSessionsDto.today) {
      order = { sessionDatetime: 'ASC' };
    } else {
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
    }

    const [sessions, total] = await this.sessionRepository.findAndCount({
      where: whereConditions,
      order,
      skip: (getSessionsDto.page - 1) * getSessionsDto.limit,
      take: getSessionsDto.limit,
    });

    // Estado de cobro (deuda) de las citas de esta página, en batch.
    const paymentStatusMap = await this.getPaymentStatusMap(
      sessions.map((s) => s.id),
    );

    // 4. Enriquecimiento (mismo formato que findAllSessionsSimple)
    const enrichedSessions = await Promise.all(
      sessions.map(async (session) => {
        const sessionClient = await this.clientRepository.findOne({
          where: { id: session.clientId },
        });

        const sessionDetails = await this.sessionDetailRepository
          .createQueryBuilder('detail')
          .leftJoin('offer', 'offer', 'offer.id = detail.offer_id')
          .where('detail.session_id = :sessionId', { sessionId: session.id })
          .andWhere(
            '(detail.company_worker_id IN (:...companyWorkerIds) OR (detail.company_worker_id IS NULL AND offer.company_id = :companyId))',
            { companyWorkerIds, companyId },
          )
          .getMany();

        const services: any[] = [];
        let totalCost = 0;
        let totalTime = 0;

        for (const detail of sessionDetails) {
          const companyWorker = detail.companyWorkerId
            ? await this.companyWorkerRepository.findOne({
                where: { id: detail.companyWorkerId },
                relations: ['worker', 'company'],
              })
            : null;

          const service = await this.serviceRepository.findOne({
            where: { id: detail.serviceId },
          });
          const realTime = this.calculateRealTime(detail);

          services.push({
            detailId: detail.id,
            serviceId: detail.serviceId,
            serviceName: service?.name || '',
            serviceDescription: service?.description || '',
            serviceCost: Number(detail.cost || 0),
            currency: service?.currency ?? null,
            totalTime: realTime,
            startDatetime: detail.startDatetime,
            companyWorkerId: detail.companyWorkerId,
            // worker.id REAL (para calificar). Distinto del companyWorkerId.
            workerId: companyWorker?.worker?.id ?? null,
            workerName: companyWorker?.worker
              ? (companyWorker.worker.name || '').trim()
              : '',
            totalWorker: Number(detail.totalWorker || 0),
            totalCompany: Number(detail.totalCompany || 0),
            detailStatus: detail.status || 1,
            detailStatusText: this.getDetailStatusText(detail.status || 1),
            isExtra: detail.isExtra === true || (detail.isExtra as any) === 1,
            isCourtesy:
              detail.isCourtesy === true || (detail.isCourtesy as any) === 1,
            description: detail.description ?? null,
            descriptionIA: detail.descriptionIA ?? null,
            descriptionWorker: detail.descriptionWorker ?? null,
            cancelReason: detail.cancelReason ?? null,
            cancelledBy: detail.cancelledBy ?? null,
            cancelledByText: this.getCancelledByText(detail.cancelledBy),
          });

          totalCost += Number(detail.cost || 0);
          totalTime += Number(detail.totalTime || 0);
        }

        return {
          id: session.id,
          clientId: session.clientId,
          clientName: sessionClient
            ? `${sessionClient.name || ''} ${sessionClient.lastName || ''}`.trim()
            : 'Cliente no encontrado',
          clientLastName: sessionClient?.lastName || '',
          clientPicture: sessionClient?.picture
            ? this.fileUploadService.getFileUrl(
                'client_photo',
                sessionClient.picture,
              )
            : null,
          companyId: company.id,
          companyName: company.name,
          sessionDatetime: session.sessionDatetime,
          sessionStatus: session.sessionStatus,
          sessionStatusText: this.getSessionStatusText(session.sessionStatus),
          totalCost,
          totalTime,
          startDatetime: session.startDatetime,
          status: session.status,
          iaResponse: session.iaResponse,
          servicesCount: sessionDetails.length,
          services,
          extraServices: session.extraServices || [],
          cancellationReason: session.cancellationReason ?? null,
          cancelledBy: session.cancelledBy ?? null,
          cancelledByText: this.getCancelledByText(session.cancelledBy),
          // Estado de cobro para el badge "En deuda".
          isPaid: paymentStatusMap.get(session.id)?.isPaid ?? false,
          pendingCollection:
            paymentStatusMap.get(session.id)?.pendingCollection ?? false,
          collectedAt: paymentStatusMap.get(session.id)?.collectedAt ?? null,
          createdAt: session['createdAt'] || null,
          updatedAt: session['updatedAt'] || null,
        };
      }),
    );

    return {
      data: enrichedSessions,
      meta: {
        page: getSessionsDto.page,
        limit: getSessionsDto.limit,
        total,
        totalPages: Math.ceil(total / getSessionsDto.limit),
        hasNext: getSessionsDto.page < Math.ceil(total / getSessionsDto.limit),
        hasPrev: getSessionsDto.page > 1,
      },
    };
  }

  private getSessionStatusText(status: number): string {
    const statusMap: Record<number, string> = {
      1: 'Agendado',
      2: 'En proceso',
      3: 'Completada',
      4: 'Pagado',
      5: 'Cancelada',
      6: 'Calificada',
      8: 'Pendiente de asignación de trabajador',
    };
    return statusMap[status] || 'Desconocido';
  }

  /**
   * Traduce el código de quién canceló a un texto legible.
   * 'adm' = Administrador, 'cli' = Cliente, 'wrk' = Trabajador,
   * 'system' = auto-cancelación por cita vencida.
   */
  private getCancelledByText(cancelledBy?: string | null): string | null {
    if (!cancelledBy) return null;
    const map: Record<string, string> = {
      adm: 'Administrador',
      cli: 'Cliente',
      wrk: 'Trabajador',
      system: 'Sistema (cita vencida)',
    };
    return map[cancelledBy] || cancelledBy;
  }

  async updateSessionStatus(
    sessionId: number,
    updateSessionStatusDto: UpdateSessionStatusDto,
    userId: number,
    userRole?: string,
  ): Promise<{
    message: string;
    session: Session;
    updated: boolean;
    detailsUpdated: number;
    validationDetails: {
      canUpdate: boolean;
      totalDetails: number;
      completedDetails: number;
      pendingDetails: number;
      allDetailsCompleted: boolean;
      errorMessage?: string;
    };
    movedByRipple: RippleMovedDetail[];
  }> {
    console.log(
      `🔄 Actualizando estado de sesión ${sessionId} a ${updateSessionStatusDto.sessionStatus}. Usuario: ${userId}, Rol: ${userRole}`,
    );

    // 1. Buscar la sesión
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // 2. Buscar los detalles de la sesión
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId: sessionId },
    });

    if (sessionDetails.length === 0) {
      throw new NotFoundException(
        `No se encontraron detalles para la sesión ${sessionId}`,
      );
    }

    // 3. Verificar permisos: este endpoint es exclusivo de administradores.
    //    Los trabajadores cambian el estado de SU servicio (detalle), no el de
    //    la cita completa — la cita se recalcula sola desde los detalles.
    if (userRole !== 'adm') {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta acción',
      );
    }

    const adminCompany = await this.companyRepository.findOne({
      where: { userId: userId },
    });

    if (!adminCompany) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

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
      throw new ForbiddenException(
        'No tienes permiso para modificar esta sesión',
      );
    }

    // 4. Validar si se puede actualizar el estado de la sesión
    const validationResult = await this.validateSessionStatusUpdate(
      sessionId,
      updateSessionStatusDto.sessionStatus,
    );

    if (!validationResult.canUpdate) {
      throw new BadRequestException({
        message: 'No se puede actualizar el estado de la sesión',
        details: validationResult,
        suggestion:
          validationResult.errorMessage || 'Revise las reglas de validación.',
      });
    }

    // 5. Actualizar el estado de la cita + propagar a los detalles.
    //    El admin tiene autoridad total: al cambiar el estado de la cita,
    //    - se marca la cita como "controlada por el admin" (statusLocked),
    //    - el nuevo estado se propaga a los detalles ACTIVOS (los cancelados
    //      en status 5 se mantienen cancelados),
    //    - desde este momento los trabajadores no pueden cambiar sus detalles
    //      y el auto-sync deja de recalcular el estado de la cita.
    const previousStatus = session.sessionStatus;
    const newStatus = updateSessionStatusDto.sessionStatus;

    // Solo se propaga a detalles si el nuevo estado es un estado válido de
    // detalle (1-5). El estado 8 (pendiente de asignación) es solo de cita.
    const cascadeToDetails = newStatus >= 1 && newStatus <= 5;
    let detailsUpdated = 0;

    const now = new Date();

    // Conservar el horario pautado (keptSchedule): si el front manda
    // keepOriginalSchedule=true ("la cita SÍ ocurrió a su hora", el botón se
    // pulsó tarde por olvido) o si la petición llega dentro de la tolerancia
    // de ±5 min, NO se registra la hora de la petición: los bloques quedan en
    // su horario, no se arrastran las citas siguientes y no se notifica.
    let keptSchedule = false;
    if (newStatus === 2) {
      const scheduledStart =
        session.startDatetime ?? session.sessionDatetime ?? null;
      keptSchedule =
        updateSessionStatusDto.keepOriginalSchedule === true ||
        (scheduledStart !== null &&
          SessionService.withinScheduleTolerance(
            now,
            new Date(scheduledStart),
          ));
    } else if (newStatus === 3) {
      // Referencia: el fin planificado de la cita = el mayor fin de sus
      // detalles activos (proyectado al Comenzar o pautado al crear).
      const plannedEnds = sessionDetails
        .filter((d) => d.status !== 5 && d.endDatetime)
        .map((d) => new Date(d.endDatetime as Date).getTime());
      const plannedEnd = plannedEnds.length
        ? new Date(Math.max(...plannedEnds))
        : null;
      keptSchedule =
        updateSessionStatusDto.keepOriginalSchedule === true ||
        (plannedEnd !== null &&
          SessionService.withinScheduleTolerance(now, plannedEnd));
    }

    const queryRunner =
      this.sessionRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let updatedSession: Session;
    try {
      session.sessionStatus = newStatus;
      session.statusLocked = true;
      // Si el admin cancela la cita completa, registrar que la canceló él.
      if (newStatus === 5) {
        session.cancelledBy = 'adm';
      }
      // Al iniciar la cita (En progreso), sobrescribir su startDatetime con la
      // hora real, igual que en los detalles. Solo cuando realmente cambia a 2
      // para no re-pisar el inicio real si ya estaba en progreso, y solo si NO
      // se está conservando el horario pautado.
      if (newStatus === 2 && previousStatus !== 2 && !keptSchedule) {
        session.startDatetime = now;
      }
      updatedSession = await queryRunner.manager.save(session);

      if (cascadeToDetails) {
        // Construir los valores a actualizar. Además del estado, al propagar
        // a los detalles registramos los tiempos reales (igual que en
        // updateDetailStatus):
        //  - status 2 (En progreso) → start_datetime = ahora (SOBRESCRIBE la
        //    hora agendada con la hora real). Para no re-pisar el inicio real
        //    de detalles que YA estaban en progreso, se excluyen con status != 2.
        //  - status 3 (Completada)  → end_datetime = ahora (fin REAL) en los
        //    detalles que estaban EN PROGRESO; los ya completados conservan su
        //    fin real (se maneja en un UPDATE aparte, ver abajo).

        // Completada (3): grabar el fin REAL en los detalles EN PROGRESO
        // (status 2) ANTES de cambiar su status. Necesario porque Comenzar deja
        // un fin PROYECTADO (no NULL); si no lo pisamos aquí, se perdería la hora
        // real de terminación (y el arrastre no detectaría el solape). Los ya
        // completados y los agendados no se tocan. Se hace en un UPDATE separado
        // para no depender del orden de evaluación del SET.
        if (newStatus === 3 && !keptSchedule) {
          await queryRunner.manager
            .createQueryBuilder()
            .update(SessionDetail)
            .set({ endDatetime: now })
            .where('sessionId = :sessionId', { sessionId })
            .andWhere('status = :inProgress', { inProgress: 2 })
            .execute();
        }

        const setValues: Record<string, unknown> = { status: newStatus };
        if (newStatus === 5) {
          setValues.cancelledBy = 'adm';
        }
        if (newStatus === 2 && !keptSchedule) {
          setValues.startDatetime = () => ':now';
          // El bloque se mueve a la hora real conservando su duración planificada
          // (piso de 1 min para no dejar altura cero). Fin proyectado para dibujar
          // el bloque y para que el arrastre detecte solapes.
          setValues.endDatetime = () =>
            'DATE_ADD(:now, INTERVAL GREATEST(COALESCE(total_time, 0), 1) MINUTE)';
        }

        let cascadeQuery = queryRunner.manager
          .createQueryBuilder()
          .update(SessionDetail)
          .set(setValues)
          .setParameter('now', now)
          .where('sessionId = :sessionId', { sessionId })
          .andWhere('status != :cancelled', { cancelled: 5 });

        // Al iniciar la cita, no tocar los detalles que ya están en progreso:
        // así conservan el inicio real que el worker ya marcó.
        if (newStatus === 2) {
          cascadeQuery = cascadeQuery.andWhere('status != :inProgress', {
            inProgress: 2,
          });
        }

        const cascadeResult = await cascadeQuery.execute();
        detailsUpdated = cascadeResult.affected || 0;
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Error al actualizar el estado de la cita: ${(error as Error).message}`,
      );
    } finally {
      await queryRunner.release();
    }

    console.log(
      `✅ Estado de sesión ${sessionId} actualizado de ${previousStatus} a ${newStatus}. Detalles propagados: ${detailsUpdated}. Cita bloqueada para trabajadores.`,
    );

    // Arrastre (ripple): al Comenzar (2) / Terminar (3) los bloques de la cita
    // se movieron/crecieron. Empujar las citas AGENDADAS siguientes de CADA
    // columna de worker de la cita (cada worker es independiente).
    // Si se CONSERVÓ el horario (keptSchedule) nada se movió: sin arrastre ni
    // notificaciones.
    const movedByRipple: RippleMovedDetail[] = [];
    if (!keptSchedule && (newStatus === 2 || newStatus === 3)) {
      const workerIds = [
        ...new Set(
          sessionDetails
            .map((d) => d.companyWorkerId)
            .filter((id): id is number => !!id),
        ),
      ];
      const ownDetailIds = sessionDetails.map((d) => d.id);
      for (const cwId of workerIds) {
        const moved = await this.rippleWorkerColumn(cwId, now, ownDetailIds);
        movedByRipple.push(...moved);
      }
    }

    return {
      message: `Estado de cita actualizado de "${this.getSessionStatusText(previousStatus)}" a "${this.getSessionStatusText(newStatus)}". ${detailsUpdated} servicio(s) actualizados. La cita queda bajo control del administrador.`,
      session: updatedSession,
      updated: true,
      detailsUpdated,
      validationDetails: validationResult,
      movedByRipple,
    };
  }

  // ==================== COBRO DE CITA (Registrar pago) ====================

  /** Comparación de dinero con tolerancia de ±0.01. */
  private static moneyEquals(a: number, b: number): boolean {
    return Math.abs(a - b) <= 0.01 + 1e-9;
  }

  async registerSessionPayment(
    sessionId: number,
    dto: RegisterSessionPaymentDto,
    adminId: number,
  ): Promise<{
    session: Session;
    payment: {
      id: number;
      sessionId: number;
      method: string | null;
      reference: string | null;
      tipCurrency: string | null;
      tip: number;
      tipExchangeRate: number | null;
      tipBs: number | null;
      totalBs: number | null;
      paidBy: number;
      paidAt: Date;
      collectedAt: Date | null;
      pendingCollection: boolean;
      lines: Array<{
        currency: string;
        subtotal: number;
        exchangeRate: number | null;
        subtotalBs: number | null;
      }>;
      tips: Array<{ companyWorkerId: number; amount: number }>;
    };
  }> {
    // 1. Cita + detalles
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`Cita con ID ${sessionId} no encontrada`);
    }
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId },
    });
    if (sessionDetails.length === 0) {
      throw new NotFoundException(
        `La cita ${sessionId} no tiene servicios asociados`,
      );
    }

    // 2. El admin debe ser dueño de la company de la cita (403)
    const adminCompany = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!adminCompany) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }
    let sessionBelongsToAdmin = false;
    for (const detail of sessionDetails) {
      if (!detail.companyWorkerId) continue;
      const cw = await this.companyWorkerRepository.findOne({
        where: { id: detail.companyWorkerId },
        relations: ['company'],
      });
      if (cw?.company?.id === adminCompany.id) {
        sessionBelongsToAdmin = true;
        break;
      }
    }
    if (!sessionBelongsToAdmin) {
      throw new ForbiddenException(
        'No tienes permiso para registrar el cobro de esta cita',
      );
    }

    // 3. Estado: solo se cobra una cita Completada (3) (409)
    if (session.sessionStatus !== 3) {
      const estado = this.getSessionStatusText(session.sessionStatus);
      throw new ConflictException(
        session.sessionStatus === 4 || session.sessionStatus === 6
          ? `La cita ya está "${estado}"`
          : `La cita debe estar "Completada" para registrar el cobro (estado actual: "${estado}")`,
      );
    }

    // 4. Sin cobro previo (409, idempotencia)
    const existing = await this.sessionPaymentRepository.findOne({
      where: { sessionId },
    });
    if (existing) {
      throw new ConflictException(
        `La cita ya tiene un cobro registrado (payment ${existing.id})`,
      );
    }

    // 5. Validaciones de negocio (422)
    const tip = dto.tip ?? 0;
    const tips = dto.tips ?? [];
    const tipsSum = tips.reduce((acc, t) => acc + (t.amount || 0), 0);
    if (!SessionService.moneyEquals(tipsSum, tip)) {
      throw new UnprocessableEntityException(
        `El reparto de propinas (${tipsSum.toFixed(2)}) no coincide con la propina total (${tip.toFixed(2)})`,
      );
    }
    const sessionCwIds = new Set(
      sessionDetails
        .map((d) => d.companyWorkerId)
        .filter((id): id is number => id != null),
    );
    for (const t of tips) {
      if (!sessionCwIds.has(t.companyWorkerId)) {
        throw new UnprocessableEntityException(
          `El trabajador ${t.companyWorkerId} no participa en esta cita`,
        );
      }
    }
    for (const line of dto.lines) {
      const isVes = line.currency.toUpperCase() === 'VES';
      if (!isVes && !(Number(line.exchangeRate) > 0)) {
        throw new UnprocessableEntityException(
          `Falta la tasa de cambio (Bs por 1 ${line.currency}) del renglón ${line.currency}`,
        );
      }
    }

    // 6. Chequeo de descuadre (criterio A: aceptar y LOGGEAR, nunca bloquear).
    //    Se compara lines[] contra la suma de los servicios NO cancelados de la
    //    cita por moneda (precios congelados en session_detail.cost; la moneda
    //    sale del servicio).
    try {
      const activeDetails = sessionDetails.filter((d) => d.status !== 5);
      const serviceIds = [
        ...new Set(activeDetails.map((d) => d.serviceId).filter(Boolean)),
      ];
      const services = serviceIds.length
        ? await this.serviceRepository.find({
            where: { id: In(serviceIds) },
            select: ['id', 'currency'],
          })
        : [];
      const currencyByService = new Map(
        services.map((s) => [s.id, (s.currency || 'USD').toUpperCase()]),
      );
      const expectedByCurrency = new Map<string, number>();
      for (const d of activeDetails) {
        const cur = currencyByService.get(d.serviceId) || 'USD';
        expectedByCurrency.set(
          cur,
          (expectedByCurrency.get(cur) || 0) + Number(d.cost || 0),
        );
      }
      for (const [cur, expected] of expectedByCurrency) {
        const line = dto.lines.find((l) => l.currency.toUpperCase() === cur);
        const sent = line ? Number(line.subtotal) : 0;
        if (!SessionService.moneyEquals(sent, expected)) {
          this.logger.warn(
            `⚠️ Cobro de cita ${sessionId}: descuadre en ${cur} — lines dice ${sent.toFixed(2)}, los servicios suman ${expected.toFixed(2)}. Se registra igual (criterio A).`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo verificar el descuadre del cobro de la cita ${sessionId}: ${(error as Error).message}`,
      );
    }

    // 7. Transacción: persistir cobro + marcar pagada + cascada a detalles
    const queryRunner =
      this.sessionRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const paidAt = new Date();
    let savedPayment: SessionPayment;
    let savedTips: SessionPaymentTip[] = [];
    let updatedSession: Session;
    try {
      savedPayment = await queryRunner.manager.save(SessionPayment, {
        sessionId,
        method: dto.method ?? null,
        reference: dto.reference ?? null,
        tipCurrency: dto.tipCurrency ?? null,
        tip,
        tipExchangeRate: dto.tipExchangeRate ?? null,
        tipBs: dto.tipBs ?? null,
        totalBs: dto.totalBs ?? null,
        paidBy: adminId,
        paidAt,
        // "En deuda": se le paga al worker pero el cliente aún no pagó a la
        // company → collected_at = null. Cobro normal → cobrado ya (= paidAt).
        collectedAt: dto.pendingCollection ? null : paidAt,
      });

      if (dto.lines.length > 0) {
        await queryRunner.manager.save(
          SessionPaymentLine,
          dto.lines.map((l) => ({
            paymentId: savedPayment.id,
            currency: l.currency.toUpperCase(),
            subtotal: l.subtotal,
            exchangeRate: l.exchangeRate ?? null,
            subtotalBs: l.subtotalBs ?? null,
          })),
        );
      }
      if (tips.length > 0) {
        savedTips = await queryRunner.manager.save(
          SessionPaymentTip,
          tips.map((t) => ({
            paymentId: savedPayment.id,
            companyWorkerId: t.companyWorkerId,
            amount: t.amount,
          })),
        );
      }

      // Marcar la cita como Pagada, igual que PUT /:id/status (cascada + lock).
      // UPDATE dirigido (solo las columnas que cambian): guardar la entidad
      // completa reescribiría columnas ajenas y el transformer de total_cost
      // convierte NULL en NaN, lo que rompería el UPDATE.
      await queryRunner.manager
        .createQueryBuilder()
        .update(Session)
        .set({ sessionStatus: 4, statusLocked: true })
        .where('id = :sessionId', { sessionId })
        .execute();
      session.sessionStatus = 4;
      session.statusLocked = true;
      updatedSession = session;

      await queryRunner.manager
        .createQueryBuilder()
        .update(SessionDetail)
        .set({ status: 4 })
        .where('sessionId = :sessionId', { sessionId })
        .andWhere('status != :cancelled', { cancelled: 5 })
        .execute();

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      // Carrera contra el UNIQUE de session_id (doble clic): 409, no 500.
      const code =
        (error as { code?: string; driverError?: { code?: string } })?.code ??
        (error as { driverError?: { code?: string } })?.driverError?.code;
      if (code === 'ER_DUP_ENTRY') {
        throw new ConflictException('La cita ya tiene un cobro registrado');
      }
      throw error;
    } finally {
      await queryRunner.release();
    }

    this.logger.log(
      `💵 Cobro registrado para cita ${sessionId} (payment ${savedPayment.id}) por admin ${adminId}. Total Bs: ${dto.totalBs ?? 'n/a'}`,
    );

    // Nómina (PAY-2 + PAY-3): al pagar, asegurar el periodo abierto y generar los
    // conceptos de comisión (uno por servicio, en Bs con la tasa del cobro).
    // Best-effort: si falla, no rompe el cobro; la idempotencia permite reintentar.
    try {
      await this.payrollPeriodService.ensureOpenPeriod(adminCompany.id, paidAt);

      const rateByCurrency = new Map(
        dto.lines.map((l) => [
          l.currency.toUpperCase(),
          l.exchangeRate ?? null,
        ]),
      );
      const serviceIds = [
        ...new Set(sessionDetails.map((d) => d.serviceId).filter(Boolean)),
      ];
      const services = serviceIds.length
        ? await this.serviceRepository.find({
            where: { id: In(serviceIds) },
            select: ['id', 'currency', 'name'],
          })
        : [];
      const svcById = new Map(services.map((s) => [s.id, s]));

      const commissionItems = sessionDetails
        // Las cortesías no generan comisión de nómina (precio 0, no cuentan).
        .filter((d) => d.status !== 5 && d.companyWorkerId && !d.isCourtesy)
        .map((d) => {
          const svc = svcById.get(d.serviceId);
          const currency = (svc?.currency || 'USD').toUpperCase();
          const rawRate = rateByCurrency.get(currency);
          const rate =
            rawRate !== undefined ? rawRate : currency === 'VES' ? 1 : null;
          return {
            sessionDetailId: d.id,
            companyWorkerId: d.companyWorkerId,
            workerAmount: Number(d.totalWorker || 0),
            serviceCost: Number(d.cost || 0),
            currency,
            exchangeRate: rate,
            label: `Comisión — ${svc?.name || 'Servicio'}`,
            appointmentId: sessionId,
          };
        });

      await this.payrollEarningsService.recordCommissions(
        adminCompany.id,
        paidAt,
        commissionItems,
        dto.method,
      );

      const serviceNameForWorker = (cwId: number): string | null => {
        const svcIds = [
          ...new Set(
            sessionDetails
              .filter((d) => d.companyWorkerId === cwId && d.status !== 5)
              .map((d) => d.serviceId),
          ),
        ];
        return svcIds.length === 1
          ? (svcById.get(svcIds[0])?.name ?? null)
          : null;
      };

      const tipItems = savedTips.map((t) => ({
        tipId: t.id,
        companyWorkerId: t.companyWorkerId,
        amount: Number(t.amount || 0),
        currency: (dto.tipCurrency || 'USD').toUpperCase(),
        exchangeRate: dto.tipExchangeRate ?? null,
        appointmentId: sessionId,
        serviceName: serviceNameForWorker(t.companyWorkerId),
      }));
      await this.payrollEarningsService.recordTips(
        adminCompany.id,
        paidAt,
        tipItems,
        dto.method,
      );
    } catch (error) {
      this.logger.warn(
        `Nómina: no se pudieron registrar conceptos de la cita ${sessionId}: ${(error as Error).message}`,
      );
    }

    return {
      session: updatedSession,
      payment: {
        id: savedPayment.id,
        sessionId,
        method: dto.method ?? null,
        reference: dto.reference ?? null,
        tipCurrency: dto.tipCurrency ?? null,
        tip,
        tipExchangeRate: dto.tipExchangeRate ?? null,
        tipBs: dto.tipBs ?? null,
        totalBs: dto.totalBs ?? null,
        paidBy: adminId,
        paidAt,
        collectedAt: savedPayment.collectedAt,
        pendingCollection: savedPayment.collectedAt == null,
        lines: dto.lines.map((l) => ({
          currency: l.currency.toUpperCase(),
          subtotal: l.subtotal,
          exchangeRate: l.exchangeRate ?? null,
          subtotalBs: l.subtotalBs ?? null,
        })),
        tips: tips.map((t) => ({
          companyWorkerId: t.companyWorkerId,
          amount: t.amount,
        })),
      },
    };
  }

  /**
   * Cobro de una cita con la misma forma del payload de registro (+ paidAt /
   * paidBy), para exponerlo en GET /sessions/:id. Devuelve null si no hay.
   */
  private async getSessionPaymentResponse(sessionId: number) {
    const payment = await this.sessionPaymentRepository.findOne({
      where: { sessionId },
    });
    if (!payment) return null;

    const [lines, tips] = await Promise.all([
      this.sessionPaymentLineRepository.find({
        where: { paymentId: payment.id },
      }),
      this.sessionPaymentTipRepository.find({
        where: { paymentId: payment.id },
      }),
    ]);

    return {
      id: payment.id,
      method: payment.method,
      reference: payment.reference,
      tipCurrency: payment.tipCurrency,
      tip: payment.tip != null ? Number(payment.tip) : 0,
      tipExchangeRate:
        payment.tipExchangeRate != null
          ? Number(payment.tipExchangeRate)
          : null,
      tipBs: payment.tipBs != null ? Number(payment.tipBs) : null,
      totalBs: payment.totalBs != null ? Number(payment.totalBs) : null,
      paidBy: payment.paidBy,
      paidAt: payment.paidAt,
      // Estado del cobro al cliente: si collected_at es null, está EN DEUDA
      // (se le pagó al worker pero el cliente aún no pagó a la company).
      collectedAt: payment.collectedAt,
      pendingCollection: payment.collectedAt == null,
      lines: lines.map((l) => ({
        currency: l.currency,
        subtotal: Number(l.subtotal),
        exchangeRate: l.exchangeRate != null ? Number(l.exchangeRate) : null,
        subtotalBs: l.subtotalBs != null ? Number(l.subtotalBs) : null,
      })),
      tips: tips.map((t) => ({
        companyWorkerId: t.companyWorkerId,
        amount: Number(t.amount),
      })),
    };
  }

  /**
   * Estado de cobro por cita, en batch (evita N+1 en los listados). Devuelve un
   * Map sessionId → { isPaid, pendingCollection, collectedAt }.
   *   - isPaid: existe un cobro registrado.
   *   - pendingCollection: hay cobro pero el cliente aún no pagó (en deuda).
   */
  private async getPaymentStatusMap(
    sessionIds: number[],
  ): Promise<
    Map<
      number,
      { isPaid: boolean; pendingCollection: boolean; collectedAt: Date | null }
    >
  > {
    const map = new Map<
      number,
      { isPaid: boolean; pendingCollection: boolean; collectedAt: Date | null }
    >();
    if (sessionIds.length === 0) return map;
    const rows: Array<{ sessionId: number; collectedAt: Date | null }> =
      await this.sessionPaymentRepository.query(
        `SELECT session_id AS sessionId, collected_at AS collectedAt
           FROM session_payments WHERE session_id IN (?)`,
        [sessionIds],
      );
    for (const r of rows) {
      map.set(r.sessionId, {
        isPaid: true,
        pendingCollection: r.collectedAt == null,
        collectedAt: r.collectedAt,
      });
    }
    return map;
  }

  /**
   * Feature B: cobros EN DEUDA de la empresa del admin (collected_at null) — se
   * le pagó al trabajador pero el cliente aún no pagó a la company. Agrupados por
   * cliente, con el monto que deben por moneda. Para la pantalla "pendientes por
   * pago".
   */
  async getPendingCollections(adminId: number) {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    const rows: Array<{
      paymentId: number;
      sessionId: number;
      paidAt: Date;
      clientId: number | null;
      clientName: string | null;
      clientLastName: string | null;
      clientPicture: string | null;
    }> = await this.sessionPaymentRepository.query(
      `SELECT sp.id AS paymentId, sp.session_id AS sessionId, sp.paid_at AS paidAt,
              s.client_id AS clientId, cl.name AS clientName,
              cl.last_name AS clientLastName, cl.picture AS clientPicture
         FROM session_payments sp
         JOIN session s ON s.id = sp.session_id
         LEFT JOIN client cl ON cl.id = s.client_id
        WHERE sp.collected_at IS NULL
          AND EXISTS (
            SELECT 1 FROM session_detail sd
              JOIN company_worker cw ON cw.id = sd.company_worker_id
             WHERE sd.session_id = sp.session_id AND cw.company_id = ?
          )
        ORDER BY sp.paid_at ASC`,
      [company.id],
    );
    if (rows.length === 0) {
      return { data: [], meta: { clients: 0, payments: 0 } };
    }

    const paymentIds = rows.map((r) => r.paymentId);
    const sessionIds = rows.map((r) => r.sessionId);

    const lineRows: Array<{
      paymentId: number;
      currency: string;
      amount: string;
    }> = await this.sessionPaymentRepository.query(
      `SELECT payment_id AS paymentId, UPPER(currency) AS currency,
              COALESCE(SUM(subtotal),0) AS amount
         FROM session_payment_lines WHERE payment_id IN (?)
        GROUP BY payment_id, currency`,
      [paymentIds],
    );
    const svcRows: Array<{ sessionId: number; serviceName: string | null }> =
      await this.sessionPaymentRepository.query(
        `SELECT sd.session_id AS sessionId, s.name AS serviceName
           FROM session_detail sd LEFT JOIN service s ON s.id = sd.service_id
          WHERE sd.session_id IN (?) AND sd.status <> 5`,
        [sessionIds],
      );

    const amountsByPayment = new Map<number, Array<{ currency; amount }>>();
    for (const l of lineRows) {
      if (!amountsByPayment.has(l.paymentId))
        amountsByPayment.set(l.paymentId, []);
      amountsByPayment
        .get(l.paymentId)!
        .push({ currency: l.currency, amount: Number(l.amount) });
    }
    const servicesBySession = new Map<number, string[]>();
    for (const s of svcRows) {
      if (!s.serviceName) continue;
      if (!servicesBySession.has(s.sessionId))
        servicesBySession.set(s.sessionId, []);
      servicesBySession.get(s.sessionId)!.push(s.serviceName);
    }

    // Agrupar por cliente.
    const byClient = new Map<
      number,
      {
        clientId: number | null;
        clientName: string;
        clientPictureUrl: string | null;
        debts: Array<unknown>;
        totals: Map<string, number>;
      }
    >();
    for (const r of rows) {
      const key = r.clientId ?? 0;
      if (!byClient.has(key)) {
        byClient.set(key, {
          clientId: r.clientId,
          clientName:
            `${(r.clientName || '').trim()} ${(r.clientLastName || '').trim()}`.trim(),
          clientPictureUrl: r.clientPicture
            ? this.fileUploadService.getFileUrl('client_photo', r.clientPicture)
            : null,
          debts: [],
          totals: new Map(),
        });
      }
      const g = byClient.get(key)!;
      const amounts = amountsByPayment.get(r.paymentId) ?? [];
      for (const a of amounts) {
        g.totals.set(a.currency, (g.totals.get(a.currency) ?? 0) + a.amount);
      }
      g.debts.push({
        sessionId: r.sessionId,
        paymentId: r.paymentId,
        paidAt: r.paidAt,
        amounts,
        serviceNames: servicesBySession.get(r.sessionId) ?? [],
      });
    }

    const data = [...byClient.values()].map((g) => ({
      clientId: g.clientId,
      clientName: g.clientName || 'Cliente',
      clientPictureUrl: g.clientPictureUrl,
      debts: g.debts,
      totalByCurrency: [...g.totals.entries()].map(([currency, amount]) => ({
        currency,
        amount,
      })),
    }));

    return { data, meta: { clients: data.length, payments: rows.length } };
  }

  /**
   * Feature B: marca un cobro en deuda como COBRADO (el cliente ya pagó a la
   * company). Setea collected_at. Idempotente. Solo el admin dueño de la cita.
   */
  async markPaymentCollected(adminId: number, sessionId: number) {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }
    const payment = await this.sessionPaymentRepository.findOne({
      where: { sessionId },
    });
    if (!payment) {
      throw new NotFoundException('No hay un cobro registrado para esta cita');
    }
    const owns: Array<{ x: number }> =
      await this.sessionPaymentRepository.query(
        `SELECT 1 AS x FROM session_detail sd
         JOIN company_worker cw ON cw.id = sd.company_worker_id
        WHERE sd.session_id = ? AND cw.company_id = ? LIMIT 1`,
        [sessionId, company.id],
      );
    if (owns.length === 0) {
      throw new ForbiddenException('Esta cita no es de tu empresa');
    }
    if (payment.collectedAt) {
      return {
        sessionId,
        collectedAt: payment.collectedAt,
        alreadyCollected: true,
      };
    }
    payment.collectedAt = new Date();
    await this.sessionPaymentRepository.save(payment);
    return {
      sessionId,
      collectedAt: payment.collectedAt,
      alreadyCollected: false,
    };
  }

  /**
   * Propinas por trabajador en un rango de fechas (para nómina). Devuelve un
   * registro por (cobro, trabajador) + totales agregados por trabajador y
   * moneda. Solo trabajadores de la company del admin autenticado.
   */
  async getWorkerTipsReport(
    adminId: number,
    startDate: string,
    endDate: string,
    companyWorkerId?: number,
  ): Promise<{
    data: Array<{
      companyWorkerId: number;
      workerName: string;
      amount: number;
      tipCurrency: string | null;
      paidAt: Date;
      sessionId: number;
    }>;
    totals: Array<{
      companyWorkerId: number;
      workerName: string;
      tipCurrency: string | null;
      total: number;
    }>;
  }> {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'startDate y endDate (YYYY-MM-DD) son requeridos',
      );
    }
    const adminCompany = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!adminCompany) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    // Rango inclusivo en la zona del negocio (misma convención del calendario)
    const { startOfDay, endOfDay } = this.resolveDateRange(startDate, endDate);

    const qb = this.sessionPaymentTipRepository
      .createQueryBuilder('t')
      .innerJoin('session_payments', 'p', 'p.id = t.payment_id')
      .innerJoin(
        'company_worker',
        'cw',
        'cw.id = t.company_worker_id AND cw.company_id = :companyId',
        { companyId: adminCompany.id },
      )
      .leftJoin('worker', 'w', 'w.id = cw.worker_id')
      .select('t.company_worker_id', 'companyWorkerId')
      .addSelect('w.name', 'workerName')
      .addSelect('t.amount', 'amount')
      .addSelect('p.tip_currency', 'tipCurrency')
      .addSelect('p.paid_at', 'paidAt')
      .addSelect('p.session_id', 'sessionId')
      .where('p.paid_at BETWEEN :start AND :end', {
        start: startOfDay,
        end: endOfDay,
      })
      .orderBy('p.paid_at', 'ASC');

    if (companyWorkerId) {
      qb.andWhere('t.company_worker_id = :cwId', { cwId: companyWorkerId });
    }

    const rows: Array<{
      companyWorkerId: string | number;
      workerName: string | null;
      amount: string;
      tipCurrency: string | null;
      paidAt: Date;
      sessionId: string | number;
    }> = await qb.getRawMany();

    const data = rows.map((r) => ({
      companyWorkerId: Number(r.companyWorkerId),
      workerName: (r.workerName || '').trim(),
      amount: Number(r.amount),
      tipCurrency: r.tipCurrency,
      paidAt: r.paidAt,
      sessionId: Number(r.sessionId),
    }));

    // Totales por (trabajador, moneda) — lo que consume payroll como concepto.
    const totalsMap = new Map<
      string,
      {
        companyWorkerId: number;
        workerName: string;
        tipCurrency: string | null;
        total: number;
      }
    >();
    for (const row of data) {
      const key = `${row.companyWorkerId}|${row.tipCurrency ?? ''}`;
      const acc = totalsMap.get(key) ?? {
        companyWorkerId: row.companyWorkerId,
        workerName: row.workerName,
        tipCurrency: row.tipCurrency,
        total: 0,
      };
      acc.total = Math.round((acc.total + row.amount) * 100) / 100;
      totalsMap.set(key, acc);
    }

    return { data, totals: [...totalsMap.values()] };
  }

  async updateDetailStatus(
    detailId: number,
    updateDetailStatusDto: UpdateDetailStatusDto,
    userId: number,
    userRole?: string, // Agrega el parámetro para el rol
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
    movedByRipple: RippleMovedDetail[];
  }> {
    console.log(
      `🔄 Actualizando estado del detalle ${detailId} a ${updateDetailStatusDto.status}. Usuario: ${userId}, Rol: ${userRole}`,
    );

    // 1. Buscar el detalle
    const detail = await this.sessionDetailRepository.findOne({
      where: { id: detailId },
    });

    if (!detail) {
      throw new NotFoundException(
        `Detalle de sesión con ID ${detailId} no encontrado`,
      );
    }

    const parentSession = await this.sessionRepository.findOne({
      where: { id: detail.sessionId },
    });

    // 1.1 Si el admin tomó el control de la cita (statusLocked):
    if (
      parentSession?.statusLocked &&
      userRole === 'adm' &&
      updateDetailStatusDto.status !== 5
    ) {
      throw new BadRequestException(
        'La cita está bajo control del administrador. Gestiona su estado con PUT /sessions/:id/status (salvo cancelar un servicio puntual).',
      );
    }

    // 1.2 Estados terminales: si la cita ya está Pagada (4), Cancelada (5)
    //     o Calificada (6), es una decisión final y no se admiten cambios
    //     en sus servicios.
    if (
      parentSession &&
      (parentSession.sessionStatus === 4 ||
        parentSession.sessionStatus === 5 ||
        parentSession.sessionStatus === 6)
    ) {
      throw new BadRequestException(
        `La cita está en estado "${this.getSessionStatusText(parentSession.sessionStatus)}" y no admite cambios en sus servicios`,
      );
    }

    // 2. Validar permisos según el rol
    if (userRole === 'adm') {
      // Para administradores: validación original
      const adminCompany = await this.companyRepository.findOne({
        where: { userId: userId },
      });

      if (!adminCompany) {
        throw new NotFoundException(
          'El administrador no tiene una compañía asignada',
        );
      }

      const companyWorker = await this.companyWorkerRepository.findOne({
        where: { id: detail.companyWorkerId },
        relations: ['company'],
      });

      if (!companyWorker || companyWorker.company.id !== adminCompany.id) {
        throw new ForbiddenException(
          'No tienes permiso para modificar este detalle',
        );
      }
    } else if (userRole === 'wrk') {
      // Para trabajadores: verificar que el detalle esté asignado a este trabajador
      const worker = await this.workerRepository.findOne({
        where: { userId: userId },
      });

      if (!worker) {
        throw new NotFoundException('Trabajador no encontrado');
      }

      // Buscar el companyWorker del trabajador
      const companyWorker = await this.companyWorkerRepository.findOne({
        where: {
          id: detail.companyWorkerId,
          workerId: worker.id,
        },
      });

      if (!companyWorker) {
        throw new ForbiddenException(
          'No tienes permiso para modificar este detalle',
        );
      }

      // Validar que el trabajador esté activo en la compañía
      if (companyWorker.isActive !== 1) {
        throw new BadRequestException('No estás activo en esta compañía');
      }
    } else {
      // Si no es ni admin ni worker
      throw new ForbiddenException(
        'No tienes permisos para realizar esta acción',
      );
    }

    // 3. Guardar estado anterior
    const previousStatus = detail.status;

    // 4. Validar que el nuevo estado sea válido (1-5 para detalles)
    if (updateDetailStatusDto.status < 1 || updateDetailStatusDto.status > 5) {
      throw new BadRequestException(
        'El estado del detalle debe ser: 1 (Agendado), 2 (En proceso), 3 (Completado), 4 (Pagado) o 5 (Cancelado)',
      );
    }

    // 4.1 El trabajador solo puede mover SU servicio a En proceso (2),
    //     Completado (3) o Cancelado (5). Agendado (1) y Pagado (4) son del admin.
    if (userRole === 'wrk') {
      const allowedWorkerStatuses = [2, 3, 5];
      if (!allowedWorkerStatuses.includes(updateDetailStatusDto.status)) {
        throw new ForbiddenException(
          'Como trabajador solo puedes marcar tu servicio como "En proceso" (2), "Completado" (3) o "Cancelado" (5)',
        );
      }
    }

    // 4.2 Si el admin ya tomó control de la cita (statusLocked), el trabajador
    //     solo puede AVANZAR el estado de su servicio, nunca retrocederlo.
    //     Cancelar (5) solo se permite mientras el servicio siga "Agendado" (1);
    //     una vez iniciado, cancelarlo es decisión del administrador.
    if (userRole === 'wrk' && parentSession?.statusLocked) {
      const progression = [1, 2, 3, 4]; // orden normal de avance
      const target = updateDetailStatusDto.status;

      if (previousStatus === 5) {
        throw new ForbiddenException(
          'La cita está bajo control del administrador y este servicio ya está cancelado; no se puede modificar',
        );
      }

      if (target === 5) {
        if (previousStatus !== 1) {
          throw new ForbiddenException(
            `La cita está bajo control del administrador. Solo puedes cancelar tu servicio mientras esté "Agendado"; el tuyo está "${this.getDetailStatusText(previousStatus)}"`,
          );
        }
      } else if (
        progression.indexOf(target) < progression.indexOf(previousStatus)
      ) {
        throw new ForbiddenException(
          `La cita está bajo control del administrador. No puedes retroceder tu servicio de "${this.getDetailStatusText(previousStatus)}" a "${this.getDetailStatusText(target)}"; solo puedes avanzarlo`,
        );
      }
    }

    // 5. Actualizar el detalle
    detail.status = updateDetailStatusDto.status;
    // ✨ Registrar tiempos reales de inicio y fin.
    //    Aplica tanto para el worker (que ejecuta el servicio) como para el
    //    admin (que puede gestionar el estado). Cada transición sobrescribe el
    //    tiempo con `new Date()` para que quede registrado el momento exacto
    //    en que se marcó "En proceso" / "Completado".
    //
    //    EXCEPCIÓN — conservar el horario pautado (keptSchedule): si el front
    //    manda keepOriginalSchedule=true ("el servicio SÍ comenzó a su hora",
    //    el botón se pulsó tarde por olvido) o si la petición llega dentro de
    //    la tolerancia de ±5 min, NO se registra la hora de la petición: el
    //    bloque se queda en su horario, no se arrastran las citas siguientes
    //    y no se envían correos/notificaciones de reprogramación.
    let keptSchedule = false;
    if (updateDetailStatusDto.status === 2) {
      const realStart = new Date();
      const scheduledStart = detail.startDatetime
        ? new Date(detail.startDatetime)
        : null;
      keptSchedule =
        updateDetailStatusDto.keepOriginalSchedule === true ||
        (scheduledStart !== null &&
          SessionService.withinScheduleTolerance(realStart, scheduledStart));

      if (!keptSchedule) {
        detail.startDatetime = realStart; // inicio real
        // El bloque se mueve a la hora real CONSERVANDO su duración planificada
        // (piso de 1 min para que nunca quede de altura cero). Se guarda el fin
        // proyectado para que (a) el calendario dibuje el bloque y (b) el
        // arrastre detecte el solape con la cita siguiente. Al Terminar se pisa
        // con el real.
        const durMin = Math.max(detail.totalTime || 0, 1);
        detail.endDatetime = new Date(realStart.getTime() + durMin * 60000);
      } else if (!detail.endDatetime && detail.startDatetime) {
        // Conservando horario pero sin fin guardado: proyectar el fin PAUTADO
        // (inicio pautado + duración) para que el bloque tenga altura.
        const durMin = Math.max(detail.totalTime || 0, 1);
        detail.endDatetime = new Date(
          new Date(detail.startDatetime).getTime() + durMin * 60000,
        );
      }
    }
    if (updateDetailStatusDto.status === 3) {
      const realEnd = new Date();
      const scheduledEnd = detail.endDatetime
        ? new Date(detail.endDatetime)
        : null;
      keptSchedule =
        updateDetailStatusDto.keepOriginalSchedule === true ||
        (scheduledEnd !== null &&
          SessionService.withinScheduleTolerance(realEnd, scheduledEnd));

      if (!keptSchedule || !detail.endDatetime) {
        // Fin real. (Sin fin previo no hay horario pautado que conservar.)
        detail.endDatetime = realEnd;
      }
      // Si por algún motivo el servicio se completa sin haber pasado por
      // "En proceso", igualamos startDatetime al fin para que el cálculo
      // del tiempo real no quede en blanco.
      if (!detail.startDatetime) {
        detail.startDatetime = detail.endDatetime;
      }
    }
    // 5.1 Si se cancela el servicio (status 5), registrar el motivo de
    //     cancelación y quién lo canceló. Para cualquier otro estado, no aplica.
    if (updateDetailStatusDto.status === 5) {
      detail.cancelReason = updateDetailStatusDto.reason ?? null;
      detail.cancelledBy = userRole;
    }

    const updatedDetail = await this.sessionDetailRepository.save(detail);

    console.log(
      `✅ Detalle ${detailId} actualizado de ${previousStatus} a ${updateDetailStatusDto.status} por ${userRole}`,
    );

    // 6. Sincronizar el estado de la cita según TODOS sus detalles.
    //    Una cita puede tener varios detalles (servicios / trabajadores distintos).
    //    Si al cancelar este detalle ya no quedan servicios activos, la cita se
    //    cancela; si aún quedan detalles activos, la cita NO se cancela y su
    //    estado se recalcula en función de los detalles restantes.
    const autoUpdateResult = await this.updateSessionStatusBasedOnDetails(
      detail.sessionId,
      userRole,
    );

    // 7. Arrastre (ripple): al Comenzar (2) o Terminar (3) el bloque se movió/
    //    creció; empujar las citas AGENDADAS siguientes del MISMO worker ese día
    //    para que no se solapen (solo lo necesario). Devuelve las movidas para
    //    que el controller notifique (push + correo) a esos clientes.
    //    Si se CONSERVÓ el horario (keptSchedule) el bloque no se movió: no hay
    //    nada que arrastrar ni nadie a quien notificar.
    let movedByRipple: RippleMovedDetail[] = [];
    if (
      !keptSchedule &&
      detail.companyWorkerId &&
      (updateDetailStatusDto.status === 2 || updateDetailStatusDto.status === 3)
    ) {
      movedByRipple = await this.rippleWorkerColumn(
        detail.companyWorkerId,
        detail.startDatetime,
        [detail.id],
      );
    }

    return {
      message: `Estado del detalle actualizado exitosamente de ${this.getDetailStatusText(previousStatus)} a ${this.getDetailStatusText(updateDetailStatusDto.status)}`,
      detail: updatedDetail,
      sessionUpdated: autoUpdateResult.updated,
      newSessionStatus: autoUpdateResult.updated
        ? autoUpdateResult.newStatus
        : null,
      validation: {
        canUpdateDetail: true,
        detailPreviousStatus: previousStatus,
        sessionId: detail.sessionId,
      },
      autoUpdateResult: {
        previousStatus: autoUpdateResult.previousStatus,
        newStatus: autoUpdateResult.newStatus,
        updated: autoUpdateResult.updated,
        reason: autoUpdateResult.reason,
      },
      movedByRipple,
    };
  }

  /**
   * Reasigna uno o varios trabajadores a los detalles de una cita.
   * Solo administradores. Valida ownership, solapes (internos + externos) y
   * duplicados (serviceId + companyWorkerId) en la cita antes de persistir.
   * Todo se aplica en una transacción: si cualquier asignación falla, no se
   * guarda nada. Tras persistir, recalcula totalWorker/totalCompany/totalTime
   * en cada detalle y el totalTime de la cita considerando solapamientos.
   */
  async assignWorkersToSession(
    sessionId: number,
    dto: AssignWorkersToSessionDto,
    adminId: number,
  ): Promise<{
    message: string;
    session: { id: number; totalTime: number };
    updates: Array<{
      detailId: number;
      serviceId: number;
      previousCompanyWorkerId: number;
      previousWorkerName: string;
      companyWorkerId: number;
      workerName: string;
      cost: number;
      totalWorker: number;
      totalCompany: number;
      totalTime: number;
      workerPercentage: number;
      companyPercentage: number;
      changed: boolean;
      calculationDetails: string;
    }>;
  }> {
    // 1. Compañía del administrador
    const adminCompany = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!adminCompany) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    // 2. Cita
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`Cita con ID ${sessionId} no encontrada`);
    }
    if (session.sessionStatus === 5) {
      throw new BadRequestException(
        'No se puede reasignar trabajadores: la cita está cancelada',
      );
    }

    // 3. Detalles actuales de la cita
    const allDetails = await this.sessionDetailRepository.find({
      where: { sessionId: sessionId },
    });
    if (allDetails.length === 0) {
      throw new NotFoundException(`La cita ${sessionId} no tiene detalles`);
    }

    // Validar que todos los detalles actuales pertenecen a la compañía del admin
    const currentWorkerIds = Array.from(
      new Set(allDetails.map((d) => d.companyWorkerId)),
    );
    const currentWorkers = await this.companyWorkerRepository.find({
      where: { id: In(currentWorkerIds) },
      relations: ['worker'],
    });
    const currentWorkersById = new Map(currentWorkers.map((cw) => [cw.id, cw]));
    for (const cw of currentWorkers) {
      if (cw.companyId !== adminCompany.id) {
        throw new ForbiddenException(
          'No tienes permiso para modificar esta cita',
        );
      }
    }

    // 4. Detectar detalleIds duplicados en la request
    const requestedDetailIds = dto.assignments.map((a) => a.detailId);
    const uniqueRequested = new Set(requestedDetailIds);
    if (uniqueRequested.size !== requestedDetailIds.length) {
      throw new BadRequestException(
        'No se puede reasignar el mismo detalle más de una vez en la misma petición',
      );
    }

    // 5. Precargar los nuevos trabajadores y los servicios implicados
    const newWorkerIds = Array.from(
      new Set(dto.assignments.map((a) => a.companyWorkerId)),
    );
    const newCompanyWorkers = await this.companyWorkerRepository.find({
      where: { id: In(newWorkerIds) },
      relations: ['worker'],
    });
    const newWorkersById = new Map(newCompanyWorkers.map((cw) => [cw.id, cw]));

    type Plan = {
      detail: SessionDetail;
      newCompanyWorkerId: number;
      newCompanyWorker: CompanyWorker;
      service: Service;
      workerPercentage: number;
      companyPercentage: number;
      newTime: number;
      newAmounts: {
        cost: number;
        totalWorker: number;
        totalCompany: number;
        calculationDetails: string;
      };
      previousCompanyWorkerId: number;
      previousWorkerName: string;
      workerName: string;
      changed: boolean;
    };

    // 6. Construir y validar el plan por cada asignación
    const plans = new Map<number, Plan>();
    for (const assignment of dto.assignments) {
      const detail = allDetails.find((d) => d.id === assignment.detailId);
      if (!detail) {
        throw new NotFoundException(
          `El detalle ${assignment.detailId} no pertenece a la cita ${sessionId}`,
        );
      }
      if (detail.status === 5) {
        throw new BadRequestException(
          `El detalle ${assignment.detailId} está cancelado y no puede reasignarse`,
        );
      }

      const newCompanyWorker = newWorkersById.get(assignment.companyWorkerId);
      if (!newCompanyWorker) {
        throw new NotFoundException(
          `Trabajador con ID ${assignment.companyWorkerId} no encontrado`,
        );
      }
      if (newCompanyWorker.companyId !== adminCompany.id) {
        throw new ForbiddenException(
          `El trabajador ${assignment.companyWorkerId} no pertenece a tu compañía`,
        );
      }
      if (newCompanyWorker.isActive !== 1) {
        throw new BadRequestException(
          `El trabajador ${assignment.companyWorkerId} no está activo`,
        );
      }

      const service = await this.serviceRepository.findOne({
        where: { id: detail.serviceId },
      });
      if (!service) {
        throw new NotFoundException(
          `Servicio con ID ${detail.serviceId} no encontrado`,
        );
      }
      this.validateServicePercentagesAndTime(service);

      // Si el servicio tiene workers habilitados, restringir la asignación a esa lista.
      if (Array.isArray(service.workers) && service.workers.length > 0) {
        const isAllowed = service.workers.some(
          (w: any) => w.id === assignment.companyWorkerId,
        );
        if (!isAllowed) {
          const allowedIds = service.workers.map((w: any) => w.id);
          const allowedWorkers = await this.companyWorkerRepository.find({
            where: { id: In(allowedIds) },
            relations: ['worker'],
          });
          const allowedNames = allowedWorkers
            .map((cw) =>
              cw.worker
                ? (cw.worker.name || '').trim() || `Trabajador #${cw.id}`
                : `Trabajador #${cw.id}`,
            )
            .filter((n) => n.length > 0);
          const workerName = newCompanyWorker.worker
            ? (newCompanyWorker.worker.name || '').trim()
            : `Trabajador #${assignment.companyWorkerId}`;
          const allowedText =
            allowedNames.length > 0
              ? allowedNames.join(', ')
              : 'ninguno configurado';
          throw new BadRequestException(
            `${workerName} no puede realizar el servicio ${service.name}. Trabajadores habilitados: ${allowedText}.`,
          );
        }
      }

      const {
        workerPercentage,
        companyPercentage,
        time: newTime,
      } = this.calculatePercentagesAndTime(service, assignment.companyWorkerId);

      const currentCost = Number(detail.cost || 0);
      if (currentCost <= 0) {
        throw new BadRequestException(
          `El detalle ${assignment.detailId} no tiene un costo válido para recalcular montos`,
        );
      }

      const newAmounts = this.calculateAmounts(
        currentCost,
        workerPercentage,
        companyPercentage,
      );

      const previousCompanyWorker = currentWorkersById.get(
        detail.companyWorkerId,
      );
      const previousWorkerName = previousCompanyWorker?.worker
        ? (previousCompanyWorker.worker.name || '').trim()
        : `Trabajador ID: ${detail.companyWorkerId}`;
      const workerName = newCompanyWorker.worker
        ? (newCompanyWorker.worker.name || '').trim()
        : `Trabajador ID: ${assignment.companyWorkerId}`;

      plans.set(assignment.detailId, {
        detail,
        newCompanyWorkerId: assignment.companyWorkerId,
        newCompanyWorker,
        service,
        workerPercentage,
        companyPercentage,
        newTime,
        newAmounts,
        previousCompanyWorkerId: detail.companyWorkerId,
        previousWorkerName,
        workerName,
        changed: detail.companyWorkerId !== assignment.companyWorkerId,
      });
    }

    // 7. Validar duplicados (serviceId + companyWorkerId) en el estado resultante
    const resultingKeys = new Set<string>();
    for (const detail of allDetails) {
      const finalCompanyWorkerId =
        plans.get(detail.id)?.newCompanyWorkerId ?? detail.companyWorkerId;
      const key = `${detail.serviceId}:${finalCompanyWorkerId}`;
      if (resultingKeys.has(key)) {
        throw new BadRequestException(
          `Conflicto: el trabajador ${finalCompanyWorkerId} quedaría asignado más de una vez al servicio ${detail.serviceId} en la misma cita`,
        );
      }
      resultingKeys.add(key);
    }

    // 8. Validar solapes contra otros detalles de la MISMA cita (estado resultante)
    const finalStateByDetailId = new Map<
      number,
      { companyWorkerId: number; startDatetime: Date; totalTime: number }
    >();
    for (const detail of allDetails) {
      const plan = plans.get(detail.id);
      finalStateByDetailId.set(detail.id, {
        companyWorkerId: plan?.newCompanyWorkerId ?? detail.companyWorkerId,
        startDatetime: detail.startDatetime,
        totalTime: plan?.newTime ?? Number(detail.totalTime || 0),
      });
    }

    for (const [detailId, plan] of plans) {
      const current = finalStateByDetailId.get(detailId)!;
      if (!current.startDatetime || !current.totalTime) continue;
      const newStart = new Date(current.startDatetime).getTime();
      const newEnd = newStart + current.totalTime * 60000;

      for (const [otherId, other] of finalStateByDetailId) {
        if (otherId === detailId) continue;
        if (other.companyWorkerId !== current.companyWorkerId) continue;
        if (!other.startDatetime || !other.totalTime) continue;
        const existingStart = new Date(other.startDatetime).getTime();
        const existingEnd = existingStart + other.totalTime * 60000;
        if (newStart < existingEnd && newEnd > existingStart) {
          throw new BadRequestException(
            `El trabajador "${plan.workerName}" tendría dos servicios solapados en la misma cita`,
          );
        }
      }
    }

    // 9. Validar solapes contra detalles de OTRAS citas
    for (const [, plan] of plans) {
      if (!plan.detail.startDatetime || !plan.newTime) continue;
      const externalConflict = await this.checkIfWorkerHasAppointmentAtSameTime(
        plan.newCompanyWorkerId,
        plan.detail.startDatetime,
        plan.newTime,
        sessionId,
      );
      if (externalConflict) {
        const conflictStart = new Date(externalConflict.startDatetime);
        throw new BadRequestException(
          `El trabajador "${plan.workerName}" ya tiene una cita asignada que se solapa con el horario (${conflictStart.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIMEZONE })}). Detalle: ${plan.detail.id}`,
        );
      }
    }

    // 10. Calcular totalTime resultante de la cita (con solapamientos)
    const newSessionTotalTime = this.calculateRealTotalTime(
      Array.from(finalStateByDetailId.values())
        .filter((s) => s.startDatetime && s.totalTime)
        .map((s) => ({
          startDatetime: s.startDatetime,
          totalTime: s.totalTime,
        })),
    );

    // 11. Persistir todo dentro de una transacción
    await this.sessionRepository.manager.transaction(async (manager) => {
      const sdRepo = manager.getRepository(SessionDetail);
      const sRepo = manager.getRepository(Session);

      for (const [detailId, plan] of plans) {
        await sdRepo
          .createQueryBuilder()
          .update(SessionDetail)
          .set({
            companyWorkerId: plan.newCompanyWorkerId,
            totalWorker: plan.newAmounts.totalWorker,
            totalCompany: plan.newAmounts.totalCompany,
            totalTime: plan.newTime,
          })
          .where('id = :id', { id: detailId })
          .execute();
      }

      await sRepo.update({ id: sessionId }, { totalTime: newSessionTotalTime });
    });

    this.logger.log(
      `✅ Cita ${sessionId}: reasignaciones aplicadas por admin ${adminId}. ` +
        `Total de detalles afectados: ${plans.size}. Nuevo totalTime de cita: ${newSessionTotalTime}`,
    );

    // 12. Respuesta
    const updates = Array.from(plans.values()).map((plan) => ({
      detailId: plan.detail.id,
      serviceId: plan.detail.serviceId,
      previousCompanyWorkerId: plan.previousCompanyWorkerId,
      previousWorkerName: plan.previousWorkerName,
      companyWorkerId: plan.newCompanyWorkerId,
      workerName: plan.workerName,
      cost: plan.newAmounts.cost,
      totalWorker: plan.newAmounts.totalWorker,
      totalCompany: plan.newAmounts.totalCompany,
      totalTime: plan.newTime,
      workerPercentage: plan.workerPercentage,
      companyPercentage: plan.companyPercentage,
      changed: plan.changed,
      calculationDetails: plan.newAmounts.calculationDetails,
    }));

    return {
      message: 'Trabajadores asignados y montos recalculados exitosamente',
      session: { id: sessionId, totalTime: newSessionTotalTime },
      updates,
    };
  }

  /**
   * Método para actualizar automáticamente el estado de la sesión basado en los estados de sus detalles
   */
  private async updateSessionStatusBasedOnDetails(
    sessionId: number,
    cancelledBy?: string,
  ): Promise<{
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
    console.log(
      `🔄 Actualizando automáticamente estado de sesión ${sessionId} basado en detalles`,
    );

    // 1. Obtener la sesión
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // 1.1 Si la cita está en un estado terminal (Pagada 4 / Cancelada 5 /
    //     Calificada 6), el auto-sync NO la modifica: es una decisión final.
    //     Nota: si el admin tomó control (statusLocked) el auto-sync SÍ corre,
    //     pero solo puede AVANZAR el estado de la cita, nunca retrocederlo
    //     (ver paso 5.1).
    if (
      session.sessionStatus === 4 ||
      session.sessionStatus === 5 ||
      session.sessionStatus === 6
    ) {
      const motivo = `la cita está en estado terminal "${this.getSessionStatusText(session.sessionStatus)}"`;
      console.log(
        `ℹ️ Sesión ${sessionId}: ${motivo}, no se recalcula automáticamente`,
      );
      return {
        previousStatus: session.sessionStatus,
        newStatus: session.sessionStatus,
        updated: false,
        reason: `No se recalcula automáticamente porque ${motivo}`,
        detailsSummary: {
          total: 0,
          scheduled: 0,
          inProcess: 0,
          completed: 0,
        },
      };
    }

    // 2. Obtener todos los detalles de la sesión
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId: sessionId },
    });

    if (sessionDetails.length === 0) {
      console.log(
        `ℹ️ Sesión ${sessionId} no tiene detalles, estado permanece igual`,
      );
      return {
        previousStatus: session.sessionStatus,
        newStatus: session.sessionStatus,
        updated: false,
        reason: 'No hay detalles en la sesión',
        detailsSummary: {
          total: 0,
          scheduled: 0,
          inProcess: 0,
          completed: 0,
        },
      };
    }

    // 3. Contar los estados de los detalles
    let scheduledCount = 0; // 1: Agendado
    let inProcessCount = 0; // 2: En proceso
    let completedCount = 0; // 3: Completado
    let paidCount = 0; // 4: Pagado
    let cancelledCount = 0; // 5: Cancelado
    const totalDetails = sessionDetails.length;

    for (const detail of sessionDetails) {
      const status = detail.status || 1; // Por defecto Agendado

      if (status === 1) {
        scheduledCount++;
      } else if (status === 2) {
        inProcessCount++;
      } else if (status === 3) {
        completedCount++;
      } else if (status === 4) {
        paidCount++;
      } else if (status === 5) {
        cancelledCount++;
      }
    }

    // Para la lógica, detalles pagados también cuentan como "terminados"
    const finishedCount = completedCount + paidCount;
    const activeDetails = totalDetails - cancelledCount;
    const allFinished = finishedCount === activeDetails && activeDetails > 0;
    const allPaid = paidCount === activeDetails && activeDetails > 0;
    const anyInProcess = inProcessCount > 0;
    const anyScheduled = scheduledCount > 0;
    const anyFinished = finishedCount > 0;

    // ¿Hay algún detalle activo (no cancelado) sin worker asignado?
    const anyUnassignedActive = sessionDetails.some(
      (d) =>
        (d.companyWorkerId === null || d.companyWorkerId === undefined) &&
        d.status !== 5,
    );

    console.log(`📊 Resumen de detalles para sesión ${sessionId}:`);
    console.log(`- Total: ${totalDetails}`);
    console.log(`- Agendados: ${scheduledCount}`);
    console.log(`- En proceso: ${inProcessCount}`);
    console.log(`- Completados: ${completedCount}`);
    console.log(`- Pagados: ${paidCount}`);
    console.log(`- Cancelados: ${cancelledCount}`);
    console.log(
      `- Estado actual de sesión: ${this.getSessionStatusText(session.sessionStatus)}`,
    );

    // 4. Determinar el nuevo estado de la sesión basado en la lógica
    const previousStatus = session.sessionStatus;
    let newStatus = previousStatus;
    let reason = '';

    // REGLAS DE ACTUALIZACIÓN AUTOMÁTICA:
    // 0. Si hay detalles activos sin trabajador asignado, y ninguno arrancó
    //    todavía (no hay in-process/completed/paid) → Sesión PENDIENTE DE
    //    ASIGNACIÓN (8). En cuanto la cita empieza o se completa, manda la
    //    lógica normal de estados.
    if (anyUnassignedActive && !anyInProcess && !anyFinished) {
      newStatus = 8; // Pendiente de asignación de trabajador
      reason = 'Hay servicios sin trabajador asignado';
    }
    // 1. Si TODOS los detalles activos están pagados (4) → Sesión PAGADA (4)
    else if (allPaid) {
      newStatus = 4; // Pagado
      reason = 'Todos los servicios han sido pagados';
    }
    // 2. Si TODOS los detalles activos están completados o pagados (3/4) → Sesión COMPLETADA (3)
    else if (allFinished) {
      newStatus = 3; // Completada
      reason = 'Todos los servicios han sido completados';
    }
    // 3. Si ALGÚN detalle está en proceso (2) → Sesión EN PROCESO (2)
    else if (anyInProcess) {
      newStatus = 2; // En proceso
      reason = 'Hay servicios en proceso';
    }
    // 4. Si ALGÚN detalle está agendado (1) y hay detalles terminados → Sesión EN PROCESO (2)
    else if (anyScheduled && anyFinished) {
      newStatus = 2; // En proceso
      reason = 'Hay servicios agendados y algunos completados';
    }
    // 5. Si ALGÚN detalle está agendado (1) → Sesión AGENDADA (1)
    else if (anyScheduled) {
      newStatus = 1; // Agendado
      reason = 'Hay servicios agendados';
    }
    // 6. Si todos los detalles están cancelados → Sesión CANCELADA (5)
    else if (cancelledCount === totalDetails && totalDetails > 0) {
      newStatus = 5; // Cancelada
      reason = 'Todos los servicios han sido cancelados';
    }

    // 5. Solo actualizar si el estado cambió
    let updated = false;

    // 5.1 Si el admin tomó control de la cita (statusLocked), el auto-sync solo
    //     puede AVANZAR el estado de la cita reflejando el progreso de los
    //     trabajadores, nunca retrocederlo: la decisión del admin no se deshace.
    //     La cancelación total (5) se permite siempre, no es un retroceso.
    const progressionRank: Record<number, number> = {
      8: 0,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
    };
    if (
      session.statusLocked === true &&
      newStatus !== previousStatus &&
      newStatus !== 5 &&
      (progressionRank[newStatus] ?? 0) < (progressionRank[previousStatus] ?? 0)
    ) {
      console.log(
        `ℹ️ Sesión ${sessionId}: la cita está bajo control del administrador; se omite el retroceso automático ${this.getSessionStatusText(previousStatus)} → ${this.getSessionStatusText(newStatus)}`,
      );
      newStatus = previousStatus;
      reason =
        'La cita está bajo control del administrador; no se aplica retroceso automático';
    }

    if (newStatus !== previousStatus) {
      session.sessionStatus = newStatus;
      // Si la cita queda cancelada porque todos sus servicios se cancelaron,
      // registrar quién provocó la cancelación (el autor del último detalle).
      if (newStatus === 5) {
        session.cancelledBy = cancelledBy ?? session.cancelledBy ?? null;
      }
      await this.sessionRepository.save(session);
      updated = true;

      console.log(
        `✅ Estado de sesión ${sessionId} actualizado automáticamente: ${this.getSessionStatusText(previousStatus)} → ${this.getSessionStatusText(newStatus)}`,
      );
      console.log(`📝 Razón: ${reason}`);
    } else {
      console.log(
        `ℹ️ Estado de sesión ${sessionId} permanece igual: ${this.getSessionStatusText(previousStatus)}`,
      );
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
        completed: completedCount,
      },
    };
  }

  private async validateSessionStatusUpdate(
    sessionId: number,
    newSessionStatus: number,
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
      where: { sessionId: sessionId },
    });

    const totalDetails = sessionDetails.length;
    const cancelledDetails = sessionDetails.filter(
      (d) => d.status === 5,
    ).length;
    const activeDetails = totalDetails - cancelledDetails;
    const completedDetails = sessionDetails.filter(
      (d) => d.status === 3,
    ).length;
    const paidDetails = sessionDetails.filter((d) => d.status === 4).length;
    const finishedDetails = completedDetails + paidDetails;
    const pendingDetails = activeDetails - finishedDetails;
    const allDetailsCompleted =
      finishedDetails === activeDetails && activeDetails > 0;

    // Contar estados para lógica automática
    const scheduledDetails = sessionDetails.filter(
      (d) => d.status === 1,
    ).length;
    const inProcessDetails = sessionDetails.filter(
      (d) => d.status === 2,
    ).length;

    // Determinar estado recomendado por lógica automática
    let recommendedStatus = 1; // Por defecto Agendado
    let reason = '';

    if (paidDetails === activeDetails && activeDetails > 0) {
      recommendedStatus = 4;
      reason = 'Todos los servicios pagados';
    } else if (allDetailsCompleted && activeDetails > 0) {
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
      where: { id: sessionId },
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
        errorMessage: 'Sesión no encontrada',
      };
    }

    // REGLAS DE VALIDACIÓN:
    let canUpdate = true;
    let errorMessage = '';

    // 1. Solo se puede marcar como pagada (4) si la sesión está completada (3)
    if (newSessionStatus === 4) {
      if (session.sessionStatus !== 3) {
        canUpdate = false;
        errorMessage =
          'La sesión debe estar en estado "Completada" antes de marcarla como "Pagada".';
      }
    }

    // 2. Advertencia si se intenta cambiar manualmente a un estado que no coincide con la lógica automática
    if (
      newSessionStatus !== 4 &&
      newSessionStatus !== 5 &&
      newSessionStatus !== recommendedStatus
    ) {
      console.warn(
        `⚠️ Intento de cambiar estado de sesión ${sessionId} a ${newSessionStatus}, pero la lógica automática recomienda ${recommendedStatus} (${reason})`,
      );
    }

    // Obtener información detallada de cada detalle
    const detailsStatus = await Promise.all(
      sessionDetails.map(async (detail) => {
        const service = await this.serviceRepository.findOne({
          where: { id: detail.serviceId },
        });

        return {
          id: detail.id,
          serviceId: detail.serviceId,
          serviceName: service?.name || 'Desconocido',
          status: detail.status,
          statusText: this.getDetailStatusText(detail.status),
          cost: detail.cost,
          totalTime: detail.totalTime,
        };
      }),
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
          completed: completedDetails,
        },
      },
      ...(errorMessage ? { errorMessage } : {}),
    };
  }

  // Actualizar estado de un detalle específico (privado)
  private async updateSpecificDetailStatus(
    detailId: number,
    status: number,
    _adminId: number,
  ): Promise<SessionDetail> {
    const detail = await this.sessionDetailRepository.findOne({
      where: { id: detailId },
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
      4: 'Pagado',
      5: 'Cancelado',
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
  /**
   * Valida que el usuario autenticado tenga acceso a la sesión indicada y
   * devuelve la sesión.
   *
   * Reglas:
   *  - Lectura (requireWrite = false): cliente dueño de la cita, worker con al
   *    menos un servicio asignado, o admin de la compañía dueña de la cita.
   *  - Escritura (requireWrite = true): solo worker asignado o admin de la
   *    compañía. El cliente nunca puede escribir.
   *
   * Lanza NotFoundException si la sesión no existe y ForbiddenException si el
   * usuario no cuenta con el permiso requerido.
   */
  async validateSessionAccess(
    sessionId: number,
    userId: number,
    userRole: 'adm' | 'wrk' | 'cli',
    requireWrite = false,
  ): Promise<Session> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // El cliente solo tiene permisos de lectura.
    if (requireWrite && userRole === 'cli') {
      throw new ForbiddenException(
        'No tienes permiso para modificar esta sesión',
      );
    }

    if (userRole === 'adm') {
      const adminCompany = await this.companyRepository.findOne({
        where: { userId },
      });
      if (!adminCompany) {
        throw new ForbiddenException(
          'El administrador no tiene una compañía asignada',
        );
      }

      const sessionDetails = await this.sessionDetailRepository.find({
        where: { sessionId },
      });

      let sessionBelongsToAdmin = false;
      for (const detail of sessionDetails) {
        if (detail.companyWorkerId == null) continue;
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
        throw new ForbiddenException(
          'No tienes permiso para acceder a esta sesión',
        );
      }
    } else if (userRole === 'wrk') {
      const worker = await this.workerRepository.findOne({
        where: { userId },
      });
      if (!worker) {
        throw new ForbiddenException('Trabajador no encontrado');
      }

      const companyWorkers = await this.companyWorkerRepository.find({
        where: { workerId: worker.id, isActive: 1 },
      });
      if (companyWorkers.length === 0) {
        throw new ForbiddenException('No estás activo en ninguna compañía');
      }

      const companyWorkerIds = companyWorkers.map((cw) => cw.id);
      const assignedDetail = await this.sessionDetailRepository.findOne({
        where: { sessionId, companyWorkerId: In(companyWorkerIds) },
      });
      if (!assignedDetail) {
        throw new ForbiddenException(
          'No tienes servicios asignados en esta sesión',
        );
      }
    } else if (userRole === 'cli') {
      const client = await this.clientRepository.findOne({
        where: { userId },
      });
      if (!client) {
        throw new ForbiddenException('Cliente no encontrado');
      }
      if (session.clientId !== client.id) {
        throw new ForbiddenException(
          'No puedes acceder a una cita que no te pertenece',
        );
      }
    } else {
      throw new ForbiddenException('Rol de usuario no válido');
    }

    return session;
  }

  /**
   * Resuelve el nombre legible de quien sube una foto (worker → nombre del
   * trabajador, admin → nombre del responsable/empresa) a partir del usuario
   * autenticado. Devuelve `{ id, name }` listo para `uploadedBy`.
   */
  async resolveUploaderInfo(
    userId: number,
    userRole: 'adm' | 'wrk' | 'cli',
  ): Promise<{ id: string; name: string }> {
    let name = '';
    if (userRole === 'wrk') {
      const worker = await this.workerRepository.findOne({
        where: { userId },
        select: ['id', 'name'],
      });
      name = (worker?.name || '').trim();
    } else if (userRole === 'adm') {
      const company = await this.companyRepository.findOne({
        where: { userId },
        select: ['id', 'name', 'managerName'],
      });
      name = (company?.managerName || company?.name || '').trim();
    }
    return { id: String(userId), name };
  }

  async getSessionDetailsWithValidation(
    sessionId: number,
    userId: number,
    userRole: 'adm' | 'wrk' | 'cli',
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
    this.logger.log(
      `🔍 Obteniendo detalles de sesión ${sessionId} para usuario ${userId} (rol: ${userRole})`,
    );

    // 1. Buscar la sesión
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // 2. Validar permisos según el rol
    if (userRole === 'adm') {
      // Admin: debe pertenecer a la compañía que posee la sesión
      const adminCompany = await this.companyRepository.findOne({
        where: { userId },
      });
      if (!adminCompany) {
        throw new NotFoundException(
          'El administrador no tiene una compañía asignada',
        );
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
        throw new ForbiddenException(
          'No tienes permiso para ver los detalles de esta sesión',
        );
      }
    } else if (userRole === 'wrk') {
      // Trabajador: debe tener al menos un servicio asignado en esta sesión
      const worker = await this.workerRepository.findOne({
        where: { userId },
      });
      if (!worker) {
        throw new NotFoundException('Trabajador no encontrado');
      }

      const companyWorkers = await this.companyWorkerRepository.find({
        where: {
          workerId: worker.id,
          isActive: 1,
        },
      });

      if (companyWorkers.length === 0) {
        throw new ForbiddenException('No estás activo en ninguna compañía');
      }

      const companyWorkerIds = companyWorkers.map((cw) => cw.id);

      const assignedDetail = await this.sessionDetailRepository.findOne({
        where: {
          sessionId,
          companyWorkerId: In(companyWorkerIds),
        },
      });

      if (!assignedDetail) {
        throw new ForbiddenException(
          'No tienes servicios asignados en esta sesión',
        );
      }
    } else if (userRole === 'cli') {
      // Cliente: debe ser el dueño de la sesión
      const client = await this.clientRepository.findOne({
        where: { userId },
      });
      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }
      if (session.clientId !== client.id) {
        throw new ForbiddenException(
          'No puedes ver los detalles de una cita que no te pertenece',
        );
      }
    } else {
      throw new ForbiddenException('Rol de usuario no válido');
    }

    // 3. Obtener información del cliente para enriquecer la respuesta
    const client = await this.clientRepository.findOne({
      where: { id: session.clientId },
    });

    // 4. Obtener todos los detalles de la sesión
    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId },
    });

    // 5. Enriquecer los detalles con información de servicios y trabajadores
    const enrichedDetails = await Promise.all(
      sessionDetails.map(async (detail) => {
        const companyWorker = await this.companyWorkerRepository.findOne({
          where: { id: detail.companyWorkerId },
          relations: ['worker', 'company'],
        });

        const service = await this.serviceRepository.findOne({
          where: { id: detail.serviceId },
        });

        // Tiempo REAL que tardó el worker en realizar el servicio:
        // endDatetime (fin real, status 3) - startDatetime (inicio real, status 2),
        // en minutos. Si aún no hay inicio/fin reales, o si los datos son
        // inconsistentes (fin anterior al inicio → tiempo negativo), se usa la
        // duración configurada del servicio (detail.totalTime) como respaldo.
        const elapsedMs =
          detail.startDatetime && detail.endDatetime
            ? new Date(detail.endDatetime).getTime() -
              new Date(detail.startDatetime).getTime()
            : null;
        const realTotalTime =
          elapsedMs !== null && elapsedMs >= 0
            ? Math.round((elapsedMs / 60000) * 100) / 100 // minutos con 2 decimales
            : detail.totalTime;

        return {
          id: detail.id,
          serviceId: detail.serviceId,
          serviceName: service?.name || 'Desconocido',
          serviceDescription: service?.description || '',
          companyWorkerId: detail.companyWorkerId,
          workerName: companyWorker?.worker
            ? (companyWorker.worker.name || '').trim()
            : 'Trabajador no encontrado',
          cost: detail.cost,
          totalTime: realTotalTime,
          totalWorker: detail.totalWorker,
          totalCompany: detail.totalCompany,
          status: detail.status,
          statusText: this.getDetailStatusText(detail.status),
          startDatetime: detail.startDatetime,
          endDatetime: detail.endDatetime,
          updatedAt: detail.updatedAt,
          description: detail.description ?? null,
          descriptionIA: detail.descriptionIA ?? null,
          descriptionWorker: detail.descriptionWorker ?? null,
          cancelReason: detail.cancelReason ?? null,
          cancelledBy: detail.cancelledBy ?? null,
          cancelledByText: this.getCancelledByText(detail.cancelledBy),
        };
      }),
    );

    // 6. Calcular resumen de estados
    const totalDetails = enrichedDetails.length;
    const completedDetails = enrichedDetails.filter(
      (d) => d.status === 3,
    ).length;
    const pendingDetails = totalDetails - completedDetails;
    const allDetailsCompleted = completedDetails === totalDetails;
    const canCompleteSession = allDetailsCompleted; // Solo se puede completar si todos los detalles están completados

    // 6.1 Tiempo real total de la sesión: suma del tiempo real de cada detalle
    //     (cada uno ya es endDatetime - startDatetime, o su duración configurada
    //     como respaldo si el servicio aún no se ha realizado).
    const sessionRealTotalTime =
      Math.round(
        enrichedDetails.reduce((sum, d) => sum + (d.totalTime || 0), 0) * 100,
      ) / 100;

    // 7. Sesión enriquecida con datos del cliente
    const enrichedSession = {
      ...session,
      totalTime: sessionRealTotalTime,
      clientName: client
        ? `${client.name || ''} ${client.lastName || ''}`.trim()
        : 'Cliente no encontrado',
      clientLastName: client?.lastName || '',
      sessionStatusText: this.getSessionStatusText(session.sessionStatus),
      // description: session.description,
      //  descriptionIA: session.descriptionIA,
      extraServices: session.extraServices,
      // cancellationReason y cancelledBy provienen del spread de `session`
      cancelledByText: this.getCancelledByText(session.cancelledBy),
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
        currentSessionStatusText: this.getSessionStatusText(
          session.sessionStatus,
        ),
      },
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
    getSessionsDto: GetSessionsDto,
  ): Promise<PaginationResult<any>> {
    console.log(
      `📋 Obteniendo sesiones para trabajador autenticado (userId: ${userId})`,
    );

    // 1. Buscar al trabajador por userId
    const worker = await this.workerRepository.findOne({
      where: { userId: userId },
    });

    if (!worker) {
      throw new NotFoundException('Trabajador no encontrado');
    }

    // 2. Buscar las asignaciones activas del trabajador en company_worker
    const companyWorkers = await this.companyWorkerRepository.find({
      where: {
        workerId: worker.id,
        isActive: 1,
      },
      relations: ['company'],
    });

    if (companyWorkers.length === 0) {
      throw new NotFoundException(
        'No tienes asignaciones activas en ninguna compañía',
      );
    }

    const companyWorkerIds = companyWorkers.map((cw) => cw.id);

    // ---------------------------------------------------------------------
    // CONSULTA PRINCIPAL: Obtener los detalles (con paginación aplicada)
    // ---------------------------------------------------------------------
    const query = this.sessionDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('session', 'session', 'session.id = detail.session_id')
      .leftJoin('client', 'client', 'client.id = session.client_id')
      .leftJoin('service', 'service', 'service.id = detail.service_id')
      .leftJoin(
        'company_worker',
        'companyWorker',
        'companyWorker.id = detail.company_worker_id',
      )
      .leftJoin('worker', 'worker', 'worker.id = companyWorker.worker_id')
      .leftJoin('company', 'company', 'company.id = companyWorker.company_id')
      .leftJoin('offer', 'offer', 'offer.id = detail.offer_id')
      .leftJoin(
        'service_offer',
        'serviceOffer',
        'serviceOffer.offer_id = detail.offer_id AND serviceOffer.service_id = detail.service_id',
      )
      .select([
        // Campos de la sesión (cita)
        'session.id AS sessionId',
        'session.client_id AS clientId',
        'session.session_datetime AS sessionDatetime',
        'session.session_status AS sessionStatus',
        'session.total_cost AS sessionTotalCost',
        'session.total_time AS sessionTotalTime',
        'session.start_datetime AS sessionStartDatetime',
        'session.original_start_datetime AS sessionOriginalStartDatetime',
        'session.status AS sessionStatusFlag',
        'session.ia_response AS iaResponse',
        'session.updated_at AS sessionUpdatedAt',
        'detail.description_worker AS descriptionWorker',
        'session.description_ia AS descriptionIA',
        'session.description AS description',
        'session.extra_services AS extraServices',
        'session.cancellation_reason AS sessionCancellationReason',
        'session.cancelled_by AS sessionCancelledBy',

        // Campos del cliente
        'client.id AS clientRealId',
        'client.name AS clientName',
        'client.last_name AS clientLastName',
        'client.email AS clientEmail',
        'client.phone AS clientPhone',
        'client.birth_date AS clientBirthDate',
        'client.location AS clientLocation',
        'client.picture AS clientPicture',

        // Campos del detalle (servicio asignado al trabajador)
        'detail.id AS detailId',
        'detail.cost AS cost',
        'detail.total_time AS totalTime',
        'detail.total_worker AS totalWorker',
        'detail.total_company AS totalCompany',
        'detail.status AS detailStatus',
        'detail.start_datetime AS detailStartDatetime',
        'detail.end_datetime AS detailEndDatetime',
        'detail.original_start_datetime AS detailOriginalStartDatetime',
        'detail.original_end_datetime AS detailOriginalEndDatetime',
        'detail.is_extra AS isExtra',
        'detail.is_courtesy AS isCourtesy',
        'detail.offer_id AS detailOfferId',
        'detail.description AS detailDescription',
        'detail.description_ia AS detailDescriptionIA',
        'detail.cancel_reason AS detailCancelReason',
        'detail.cancelled_by AS detailCancelledBy',

        // Campos del servicio
        'service.id AS serviceId',
        'service.name AS serviceName',
        'service.description AS serviceDescription',
        'service.currency AS serviceCurrency',
        'service.cost AS serviceOriginalCost',
        'service.standard_time AS serviceStandardTime',

        // Campos de la oferta aplicada al detalle (si la hay)
        'offer.id AS offerId',
        'offer.name AS offerName',
        'offer.description AS offerDescription',
        'offer.start_date AS offerStartDate',
        'offer.end_date AS offerEndDate',
        'offer.logo AS offerLogo',
        'offer.status AS offerStatus',
        'serviceOffer.price AS offerSpecialPrice',

        // Campos del trabajador / compañía
        'companyWorker.id AS companyWorkerId',
        'company.id AS companyId',
        'company.name AS companyName',
        'company.address AS companyAddress',
        'worker.id AS workerId',
        'worker.name AS workerName',
        'worker.picture AS workerPicture',
      ])
      .where('detail.company_worker_id IN (:...companyWorkerIds)', {
        companyWorkerIds,
      });

    // =========================================================================
    // FILTROS DE FECHA - AHORA SE APLICAN SOBRE session.session_datetime
    // =========================================================================

    // PRIORIDAD 1: Filtrar por una fecha específica (date)
    if (getSessionsDto.date) {
      const { startOfDay, endOfDay } = businessDayBounds(getSessionsDto.date);
      query.andWhere(
        'session.session_datetime BETWEEN :startOfDay AND :endOfDay',
        { startOfDay, endOfDay },
      );
      console.log(
        `📅 Trabajador: Filtrando por fecha ${getSessionsDto.date} (zona negocio)`,
      );
    }
    // PRIORIDAD 2: Filtrar por día actual (today), en la zona del negocio
    else if (getSessionsDto.today) {
      const { startOfDay, endOfDay } = businessDayBounds(businessToday());
      query.andWhere(
        'session.session_datetime BETWEEN :startOfDay AND :endOfDay',
        { startOfDay, endOfDay },
      );
      console.log(
        `📅 Trabajador: Filtrando por día actual (${businessToday()})`,
      );
    }
    // PRIORIDAD 3: Filtrar por rango de fechas (inclusivo en ambos extremos).
    else if (getSessionsDto.startDate && getSessionsDto.endDate) {
      const { startOfDay, endOfDay } = this.resolveDateRange(
        getSessionsDto.startDate,
        getSessionsDto.endDate,
      );
      query.andWhere(
        'session.session_datetime BETWEEN :startDate AND :endDate',
        { startDate: startOfDay, endDate: endOfDay },
      );
    }

    // FILTRO: Solo servicios agendados (detail.status = 1)
    if (getSessionsDto.onlyScheduled) {
      query.andWhere('detail.status = :onlyScheduledStatus', {
        onlyScheduledStatus: 1,
      });
      console.log(
        `📋 Trabajador: Filtrando solo servicios agendados (detail.status = 1)`,
      );
    }
    // FILTRO: Por estado de sesión (uno o varios)
    else if (
      getSessionsDto.sessionStatus &&
      getSessionsDto.sessionStatus.length > 0
    ) {
      query.andWhere('session.session_status IN (:...sessionStatus)', {
        sessionStatus: getSessionsDto.sessionStatus,
      });
    }

    // FILTRO: Por estado del detalle (uno o varios)
    if (getSessionsDto.detailStatus && getSessionsDto.detailStatus.length > 0) {
      query.andWhere('detail.status IN (:...detailStatus)', {
        detailStatus: getSessionsDto.detailStatus,
      });
    }

    // FILTRO: Por ID de cliente
    if (getSessionsDto.clientId) {
      query.andWhere('session.client_id = :clientId', {
        clientId: getSessionsDto.clientId,
      });
    }

    // FILTRO: Por ID de compañía
    if (getSessionsDto.companyId) {
      query.andWhere('company.id = :companyId', {
        companyId: getSessionsDto.companyId,
      });
    }

    // Ordenar por fecha del detalle (detail.start_datetime).
    // Cuando today=true, forzar ASC (hora más temprana primero).
    const detailOrder: 'ASC' | 'DESC' = getSessionsDto.today
      ? 'ASC'
      : getSessionsDto.orderBy === 'oldest'
        ? 'ASC'
        : 'DESC';
    query.orderBy('detail.start_datetime', detailOrder);

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
      .leftJoin(
        'company_worker',
        'companyWorker',
        'companyWorker.id = detail.company_worker_id',
      )
      .leftJoin('company', 'company', 'company.id = companyWorker.company_id')
      .where('detail.company_worker_id IN (:...companyWorkerIds)', {
        companyWorkerIds,
      });

    // Replicar los mismos filtros de fecha sobre session.session_datetime
    if (getSessionsDto.date) {
      const { startOfDay, endOfDay } = businessDayBounds(getSessionsDto.date);
      countQuery.andWhere(
        'session.session_datetime BETWEEN :startOfDay AND :endOfDay',
        { startOfDay, endOfDay },
      );
    } else if (getSessionsDto.today) {
      const { startOfDay, endOfDay } = businessDayBounds(businessToday());
      countQuery.andWhere(
        'session.session_datetime BETWEEN :startOfDay AND :endOfDay',
        { startOfDay, endOfDay },
      );
    } else if (getSessionsDto.startDate && getSessionsDto.endDate) {
      // Mismo rango inclusivo que la query principal, para que meta.total cuadre.
      const { startOfDay: rangeStart, endOfDay: rangeEnd } =
        this.resolveDateRange(getSessionsDto.startDate, getSessionsDto.endDate);
      countQuery.andWhere(
        'session.session_datetime BETWEEN :startDate AND :endDate',
        { startDate: rangeStart, endDate: rangeEnd },
      );
    }

    // Replicar el resto de filtros
    if (getSessionsDto.onlyScheduled) {
      countQuery.andWhere('detail.status = :onlyScheduledStatus', {
        onlyScheduledStatus: 1,
      });
    } else if (
      getSessionsDto.sessionStatus &&
      getSessionsDto.sessionStatus.length > 0
    ) {
      countQuery.andWhere('session.session_status IN (:...sessionStatus)', {
        sessionStatus: getSessionsDto.sessionStatus,
      });
    }

    if (getSessionsDto.detailStatus && getSessionsDto.detailStatus.length > 0) {
      countQuery.andWhere('detail.status IN (:...detailStatus)', {
        detailStatus: getSessionsDto.detailStatus,
      });
    }

    if (getSessionsDto.clientId) {
      countQuery.andWhere('session.client_id = :clientId', {
        clientId: getSessionsDto.clientId,
      });
    }

    if (getSessionsDto.companyId) {
      countQuery.andWhere('company.id = :companyId', {
        companyId: getSessionsDto.companyId,
      });
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
          clientName: detail.clientName
            ? `${detail.clientName || ''} ${detail.clientLastName || ''}`.trim()
            : 'Cliente no encontrado',
          clientLastName: detail.clientLastName || '',
          // === DATOS DEL CLIENTE ===
          client: {
            id: detail.clientRealId || detail.clientId,
            name: detail.clientName || '',
            lastName: detail.clientLastName || '',
            fullName:
              `${detail.clientName || ''} ${detail.clientLastName || ''}`.trim() ||
              'Cliente no encontrado',
            email: detail.clientEmail || null,
            phone: detail.clientPhone || null,
            birthDate: detail.clientBirthDate || null,
            location: detail.clientLocation || null,
            picture: detail.clientPicture
              ? this.fileUploadService.getFileUrl(
                  'client_photo',
                  detail.clientPicture,
                )
              : null,
          },
          sessionDatetime: detail.sessionDatetime,
          sessionStatus: detail.sessionStatus,
          sessionStatusText: this.getSessionStatusText(detail.sessionStatus),
          sessionTotalCost: parseFloat(detail.sessionTotalCost) || 0,
          sessionTotalTime: parseFloat(detail.sessionTotalTime) || 0,
          // Dirección de la cita (dirección de la compañía)
          address: detail.companyAddress ?? null,
          startDatetime: detail.sessionStartDatetime,
          // Hora agendada original de la cita (para la tarjeta).
          originalStartDatetime: detail.sessionOriginalStartDatetime,
          status: detail.sessionStatusFlag,
          iaResponse: detail.iaResponse,
          descriptionWorker: detail.descriptionWorker,
          descriptionIA: detail.descriptionIA,
          description: detail.description,
          extraServices: detail.extraServices,
          cancellationReason: detail.sessionCancellationReason ?? null,
          cancelledBy: detail.sessionCancelledBy ?? null,
          cancelledByText: this.getCancelledByText(detail.sessionCancelledBy),
          createdAt: detail.sessionUpdatedAt,
          // === SERVICIOS ASIGNADOS A ESTE TRABAJADOR ===
          assignedServices: [],
          assignedTotalCost: 0,
          // Tiempo estimado total del trabajador para la cita (suma de durationWorker)
          workerEstimateTime: 0,
          // Duración real total de la cita (suma de realDuration de cada servicio)
          realTotalTime: 0,
          assignedServicesCount: 0,
          assignedOverallStatus: null,
          hasAssignedTodayDetail: false,
        });
      }

      const sessionData = sessionMap.get(sessionId);

      const cost = parseFloat(detail.cost) || 0;
      const totalTime = parseFloat(detail.totalTime) || 0;
      const realTime = this.calculateRealTimeRaw(
        detail.detailStatus,
        detail.detailStartDatetime,
        detail.detailEndDatetime,
      );
      const totalWorker = parseFloat(detail.totalWorker) || 0;
      const totalCompany = parseFloat(detail.totalCompany) || 0;

      let workerPercentage = 0;
      let companyPercentage = 0;
      if (cost > 0) {
        workerPercentage = parseFloat(((totalWorker / cost) * 100).toFixed(2));
        companyPercentage = parseFloat(
          ((totalCompany / cost) * 100).toFixed(2),
        );
      }

      // Datos de la oferta aplicada al detalle (si la hay)
      const originalPrice = parseFloat(detail.serviceOriginalCost) || 0;
      const offerPrice = parseFloat(detail.offerSpecialPrice) || 0;
      const hasOffer =
        detail.detailOfferId !== null && detail.detailOfferId !== undefined;
      const discountAmount = hasOffer
        ? Math.max(originalPrice - offerPrice, 0)
        : 0;
      const discountPercentage =
        hasOffer && originalPrice > 0
          ? parseFloat(((discountAmount / originalPrice) * 100).toFixed(2))
          : 0;

      const offerObj = hasOffer
        ? {
            id: detail.offerId,
            name: detail.offerName,
            description: detail.offerDescription,
            startDate: detail.offerStartDate,
            endDate: detail.offerEndDate,
            status: detail.offerStatus,
            logoUrl: detail.offerLogo
              ? this.fileUploadService.getFileUrl(
                  'offer_logo',
                  detail.offerLogo,
                )
              : null,
            originalPrice,
            offerPrice,
            discountAmount: parseFloat(discountAmount.toFixed(2)),
            discountPercentage,
          }
        : null;

      sessionData.assignedServices.push({
        detailId: detail.detailId,
        serviceId: detail.serviceId,
        serviceName: detail.serviceName || 'Servicio no encontrado',
        serviceDescription: detail.serviceDescription || '',
        currency: detail.serviceCurrency ?? null,
        // Tiempo estimado del servicio definido por la compañía (en minutos)
        standardTime:
          detail.serviceStandardTime != null
            ? Number(detail.serviceStandardTime)
            : null,
        cost,
        originalPrice,
        appliedPrice: cost,
        isOffer: hasOffer,
        offerId: hasOffer ? detail.detailOfferId : null,
        offer: offerObj,
        // Tiempo planificado del trabajador para este servicio (en minutos)
        durationWorker: totalTime,
        // Tiempo real del servicio (inicio→fin; 0 si no está completado)
        realDuration: realTime,
        totalWorker,
        totalCompany,
        detailStatus: detail.detailStatus || 1,
        detailStatusText: this.getDetailStatusText(detail.detailStatus || 1),
        startDatetime: detail.detailStartDatetime,
        // CLYP-311 (B4): fin por detalle para dibujar el bloque en el calendario.
        endDatetime: detail.detailEndDatetime,
        // Hora agendada original (para "agendada X · movida a Y").
        originalStartDatetime: detail.detailOriginalStartDatetime,
        originalEndDatetime: detail.detailOriginalEndDatetime,
        isExtra: detail.isExtra === true || detail.isExtra === 1,
        isCourtesy: detail.isCourtesy === true || detail.isCourtesy === 1,
        companyId: detail.companyId,
        companyName: detail.companyName || 'Compañía no encontrada',
        workerPercentage,
        companyPercentage,
        workerId: detail.workerId,
        workerName: detail.workerName,
        workerPhotoUrl: detail.workerPicture
          ? this.fileUploadService.getFileUrl(
              'worker_photo',
              detail.workerPicture,
            )
          : null,
        description: detail.detailDescription ?? null,
        descriptionIA: detail.detailDescriptionIA ?? null,
        cancelReason: detail.detailCancelReason ?? null,
        cancelledBy: detail.detailCancelledBy ?? null,
        cancelledByText: this.getCancelledByText(detail.detailCancelledBy),
      });

      sessionData.assignedTotalCost += cost;
      sessionData.workerEstimateTime += totalTime;
      sessionData.realTotalTime += realTime;
      sessionData.assignedServicesCount += 1;
    }

    // ---------------------------------------------------------------------
    // CALCULAR ESTADO CONSOLIDADO DEL TRABAJADOR POR SESIÓN
    // ---------------------------------------------------------------------
    const sessions = Array.from(sessionMap.values()).map((session) => {
      const allScheduled = session.assignedServices.every(
        (s) => s.detailStatus === 1,
      );
      const anyInProcess = session.assignedServices.some(
        (s) => s.detailStatus === 2,
      );
      const allCompleted = session.assignedServices.every(
        (s) => s.detailStatus === 3,
      );

      let overallStatus = 'Desconocido';
      if (allCompleted) overallStatus = 'Completado';
      else if (anyInProcess) overallStatus = 'En proceso';
      else if (allScheduled) overallStatus = 'Agendado';
      else if (
        session.assignedServices.some((s) => s.detailStatus === 3) &&
        session.assignedServices.some((s) => s.detailStatus !== 3)
      ) {
        overallStatus = 'Parcialmente completado';
      }

      const hasAssignedToday = session.assignedServices.some((s) =>
        this.isToday(s.startDatetime),
      );

      return {
        ...session,
        assignedTotalCost: parseFloat(session.assignedTotalCost.toFixed(2)),
        workerEstimateTime: parseFloat(session.workerEstimateTime.toFixed(2)),
        realTotalTime: parseFloat(session.realTotalTime.toFixed(2)),
        assignedOverallStatus: overallStatus,
        hasAssignedTodayDetail: hasAssignedToday,
      };
    });

    // ---------------------------------------------------------------------
    // FILTRAR POR 'today' SI ES NECESARIO (ya aplicado en la consulta, pero se deja por si acaso)
    // ---------------------------------------------------------------------
    let filteredSessions = sessions;
    if (getSessionsDto.today) {
      // Aunque ya filtramos en la BD, podemos dejarlo como respaldo
      filteredSessions = sessions.filter((s) =>
        this.isToday(s.sessionDatetime),
      );
    }

    // ---------------------------------------------------------------------
    // ORDENAR SESIONES
    // ---------------------------------------------------------------------
    if (getSessionsDto.orderBy === 'oldest') {
      filteredSessions.sort((a, b) => {
        const aDate =
          a.assignedServices.length > 0
            ? new Date(a.assignedServices[0].startDatetime).getTime()
            : new Date(a.sessionDatetime).getTime();
        const bDate =
          b.assignedServices.length > 0
            ? new Date(b.assignedServices[0].startDatetime).getTime()
            : new Date(b.sessionDatetime).getTime();
        return aDate - bDate;
      });
    } else {
      filteredSessions.sort((a, b) => {
        const aDate =
          a.assignedServices.length > 0
            ? new Date(a.assignedServices[0].startDatetime).getTime()
            : new Date(a.sessionDatetime).getTime();
        const bDate =
          b.assignedServices.length > 0
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
      },
    };
  }

  /**
   * Método auxiliar para verificar si una fecha es hoy
   */
  private isToday(date: Date): boolean {
    const inputDate = new Date(date);
    const today = new Date();

    return (
      inputDate.getDate() === today.getDate() &&
      inputDate.getMonth() === today.getMonth() &&
      inputDate.getFullYear() === today.getFullYear()
    );
  }

  /**
   * Calcular el estado general del trabajador para una sesión basado en sus detalles
   */
  private calculateWorkerOverallStatus(workerServices: any[]): string {
    if (workerServices.length === 0) return 'Sin servicios';

    const allCompleted = workerServices.every(
      (service) => service.detailStatus === 3,
    );
    const anyInProgress = workerServices.some(
      (service) => service.detailStatus === 2,
    );
    const anyScheduled = workerServices.some(
      (service) => service.detailStatus === 1,
    );

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
    clientUserId: number,
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
      companyWorkerId: number | null;
      workerName: string;
      totalCost: number;
      totalTime: number;
      workerPercentage: number;
      companyPercentage: number;
      totalWorker: number;
      totalCompany: number;
      calculationDetails: string;
      workerAssigned: boolean;
      isOffer: boolean;
      appliedOfferId: number | null;
      offerName: string | null;
      originalPrice: number | null;
    }>;
    createdDetails?: SessionDetail[];
    existingSession?: Session;
  }> {
    console.log(`👤 Cliente creando sesión (userId: ${clientUserId})`);

    // 1. Obtener el cliente a partir del userId
    const client = await this.clientRepository.findOne({
      where: { userId: clientUserId },
    });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    // 2. Validaciones iniciales - El cliente no debe enviar clientId, se usa el suyo
    if (createSessionWithDetailDto.clientId) {
      console.warn(
        `⚠️ Cliente intentó especificar clientId: ${createSessionWithDetailDto.clientId}. Se usará su propio ID: ${client.id}`,
      );
    }

    // Usar el ID del cliente autenticado
    const clientId = client.id;

    if (
      !createSessionWithDetailDto.details ||
      createSessionWithDetailDto.details.length === 0
    ) {
      throw new BadRequestException('Debe proporcionar al menos un servicio');
    }

    // 3. Determinar la compañía a partir de trabajadores y/u ofertas.
    //    Cada detalle debe traer companyWorkerId u offerId; si trae solo offerId,
    //    la compañía se deriva de la oferta.
    const uniqueCompanyWorkerIds = [
      ...new Set(
        createSessionWithDetailDto.details
          .map((d) => d.companyWorkerId)
          .filter((id): id is number => id !== null && id !== undefined),
      ),
    ];
    const uniqueOfferIds = [
      ...new Set(
        createSessionWithDetailDto.details
          .map((d) => d.offerId)
          .filter((id): id is number => id !== null && id !== undefined),
      ),
    ];

    let companyWorkers: CompanyWorker[] = [];
    if (uniqueCompanyWorkerIds.length > 0) {
      companyWorkers = await this.companyWorkerRepository.find({
        where: { id: In(uniqueCompanyWorkerIds) },
        relations: ['company'],
      });

      if (companyWorkers.length !== uniqueCompanyWorkerIds.length) {
        throw new NotFoundException(
          'No se encontraron los trabajadores especificados',
        );
      }
    }

    let offers: Offer[] = [];
    if (uniqueOfferIds.length > 0) {
      offers = await this.offerRepository.find({
        where: { id: In(uniqueOfferIds) },
        relations: ['company'],
      });

      if (offers.length !== uniqueOfferIds.length) {
        throw new NotFoundException(
          'No se encontraron las ofertas especificadas',
        );
      }
    }

    const companyIdsFromWorkers = companyWorkers
      .map((cw) => cw.company?.id)
      .filter((id): id is number => id !== undefined);
    const companyIdsFromOffers = offers
      .map((o) => o.companyId)
      .filter((id): id is number => id !== null && id !== undefined);

    const uniqueCompanyIds = [
      ...new Set([...companyIdsFromWorkers, ...companyIdsFromOffers]),
    ];

    if (uniqueCompanyIds.length === 0) {
      throw new BadRequestException(
        'No se pudo determinar la compañía: cada detalle debe incluir companyWorkerId u offerId',
      );
    }

    if (uniqueCompanyIds.length > 1) {
      throw new BadRequestException(
        'Todos los servicios deben ser de la misma compañía',
      );
    }

    const companyId = uniqueCompanyIds[0];
    const company =
      companyWorkers[0]?.company ??
      offers[0]?.company ??
      (await this.companyRepository.findOne({ where: { id: companyId } }));

    if (!company) {
      throw new NotFoundException('Compañía no encontrada');
    }

    const companyName = company.name;

    // 4. Verificar si el cliente ya tiene una cita en la misma fecha y hora
    if (createSessionWithDetailDto.sessionDatetime) {
      const existingAppointment =
        await this.checkIfClientHasAppointmentAtSameTime(
          clientId,
          createSessionWithDetailDto.sessionDatetime,
          companyId,
        );

      if (existingAppointment) {
        const appointmentDate = new Date(existingAppointment.sessionDatetime);
        const formattedDate = appointmentDate.toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: BUSINESS_TIMEZONE,
        });
        const formattedTime = appointmentDate.toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: BUSINESS_TIMEZONE,
        });

        throw new BadRequestException({
          message: `Ya tienes una cita agendada para la misma fecha y hora.`,
          details: {
            existingAppointmentId: existingAppointment.id,
            appointmentDateTime: existingAppointment.sessionDatetime,
            formattedDate: formattedDate,
            formattedTime: formattedTime,
            sessionStatus: existingAppointment.sessionStatus,
            statusText: this.getSessionStatusText(
              existingAppointment.sessionStatus,
            ),
          },
          suggestion:
            'Por favor, seleccione una fecha y hora diferente para esta cita.',
        });
      }
    }

    // 5. Definir tipo para las validaciones de servicio
    type ServiceValidationType = {
      detail: SessionDetailItemDto;
      service: Service;
      companyWorker: CompanyWorker | null;
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
      companyWorkerId: number | null;
      workerName: string;
      totalCost: number;
      totalTime: number;
      workerPercentage: number;
      companyPercentage: number;
      totalWorker: number;
      totalCompany: number;
      calculationDetails: string;
      workerAssigned: boolean;
      isOffer: boolean;
      appliedOfferId: number | null;
      offerName: string | null;
      originalPrice: number | null;
    }> = [];

    const serviceValidations: ServiceValidationType[] = [];

    // Pre-validar todos los servicios
    for (const detail of createSessionWithDetailDto.details) {
      // Los clientes pueden agendar servicios de cualquier compañía
      const service = await this.serviceRepository.findOne({
        where: { id: detail.serviceId },
      });

      if (!service) {
        throw new NotFoundException(
          `Servicio con ID ${detail.serviceId} no encontrado`,
        );
      }

      // Verificar que el servicio pertenezca a la misma compañía que el trabajador
      if (service.companyId !== companyId) {
        throw new BadRequestException(
          `El servicio ${service.name} no pertenece a la compañía del trabajador seleccionado`,
        );
      }

      // Si no se asignó trabajador, el detalle queda pendiente de asignación.
      // El DTO garantiza que en ese caso venga offerId; saltamos las
      // validaciones de disponibilidad/porcentaje por trabajador.
      const hasWorker =
        detail.companyWorkerId !== null && detail.companyWorkerId !== undefined;

      let companyWorker: CompanyWorker | null = null;
      let workerPercentage = 0;
      let companyPercentage = 100;
      let workerAssigned = false;
      // CLYP-311: si viene fin explícito (detailEndDatetime), la duración =
      // fin - inicio y tiene prioridad sobre el tiempo del servicio/worker.
      const overrideMinutes = this.durationMinutesFromRange(
        detail.detailStartDatetime,
        detail.detailEndDatetime,
      );
      let detailTime = overrideMinutes ?? (Number(service.standardTime) || 0);

      // Validar estructura general de porcentajes/tiempos del servicio siempre.
      this.validateServicePercentagesAndTime(service);

      if (hasWorker) {
        companyWorker = await this.companyWorkerRepository.findOne({
          where: {
            id: detail.companyWorkerId as number,
            companyId: companyId,
          },
          relations: ['worker'],
        });

        if (!companyWorker) {
          throw new NotFoundException(
            `Trabajador de compañía con ID ${detail.companyWorkerId} no encontrado`,
          );
        }

        if (companyWorker.isActive !== 1) {
          throw new BadRequestException(
            `El trabajador de compañía con ID ${detail.companyWorkerId} no está activo`,
          );
        }

        const perc = this.calculatePercentagesAndTime(
          service,
          detail.companyWorkerId as number,
        );
        workerPercentage = perc.workerPercentage;
        companyPercentage = perc.companyPercentage;
        workerAssigned = perc.workerAssigned;
        detailTime = overrideMinutes ?? perc.time;

        // Verificar si el trabajador ya tiene una cita que se solape con este horario
        const detailStartDatetime =
          detail.detailStartDatetime ||
          createSessionWithDetailDto.startDatetime ||
          createSessionWithDetailDto.sessionDatetime;
        if (detailStartDatetime) {
          const workerConflict =
            await this.checkIfWorkerHasAppointmentAtSameTime(
              detail.companyWorkerId as number,
              detailStartDatetime,
              detailTime,
            );

          if (workerConflict) {
            const conflictStart = new Date(workerConflict.startDatetime);
            const workerName = companyWorker.worker
              ? (companyWorker.worker.name || '').trim()
              : `Trabajador ID: ${companyWorker.id}`;
            throw new BadRequestException(
              `El trabajador "${workerName}" ya tiene una cita asignada que se solapa con el horario seleccionado (${conflictStart.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIMEZONE })}). Por favor, seleccione otro horario o trabajador.`,
            );
          }
        }
      }

      // Resolver precio: oferta o normal
      const priceResolution = await this.resolveServicePrice(
        detail.serviceId,
        companyId,
        detail.offerId,
        createSessionWithDetailDto.sessionDatetime,
      );

      let serviceCostNumber: number;

      if (priceResolution.isOffer) {
        // Precio de la oferta (service_offer.price)
        serviceCostNumber = priceResolution.finalPrice;
        console.log(
          `🏷️ Servicio "${service.name}" → precio de OFERTA "${priceResolution.offerName}": ${serviceCostNumber}`,
        );
      } else {
        // Precio normal: costo por trabajador (CLYP-301) con fallback a
        // service.cost. worker.cost ?? service.cost.
        serviceCostNumber = this.resolveWorkerServiceCost(
          service,
          detail.companyWorkerId,
        );
        console.log(
          `💰 Servicio "${service.name}" → precio NORMAL (worker.cost ?? service.cost): ${serviceCostNumber}`,
        );
      }

      if (serviceCostNumber <= 0) {
        throw new BadRequestException(
          `El costo del servicio "${service.name}" debe ser mayor a 0`,
        );
      }

      const calculatedAmounts = this.calculateAmounts(
        serviceCostNumber,
        workerPercentage,
        companyPercentage,
      );

      const detailCost = calculatedAmounts.cost;
      totalSessionCost += detailCost;

      const workerName = companyWorker
        ? companyWorker.worker
          ? (companyWorker.worker.name || '').trim()
          : `Trabajador ID: ${companyWorker.id}`
        : 'Sin asignar';

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
        detailTime,
      });

      calculations.push({
        serviceId: detail.serviceId,
        serviceName: service.name || '',
        companyWorkerId: detail.companyWorkerId ?? null,
        workerName: workerName,
        totalCost: detailCost,
        totalTime: detailTime,
        workerPercentage,
        companyPercentage,
        totalWorker: calculatedAmounts.totalWorker,
        totalCompany: calculatedAmounts.totalCompany,
        calculationDetails: calculatedAmounts.calculationDetails,
        workerAssigned,
        // Info de oferta
        isOffer: priceResolution.isOffer,
        appliedOfferId: priceResolution.appliedOfferId,
        offerName: priceResolution.offerName,
        originalPrice: priceResolution.isOffer ? Number(service.cost) : null,
      });
    }

    // 7. Calcular tiempo total real considerando solapamiento entre servicios
    const defaultClientStartDatetime =
      createSessionWithDetailDto.startDatetime ||
      createSessionWithDetailDto.sessionDatetime ||
      new Date();
    totalSessionTime = this.calculateRealTotalTime(
      serviceValidations.map((v) => ({
        startDatetime:
          v.detail.detailStartDatetime || defaultClientStartDatetime,
        totalTime: v.detailTime,
      })),
    );

    // Si algún detalle quedó sin trabajador, la cita arranca en estado 8
    // (pendiente de asignación) salvo que el request especifique otro estado.
    const hasUnassignedDetailClient = serviceValidations.some(
      (v) =>
        v.detail.companyWorkerId === null ||
        v.detail.companyWorkerId === undefined,
    );
    const defaultClientSessionStatus = hasUnassignedDetailClient ? 8 : 1;

    // 8. Crear datos de la sesión con los totales calculados
    const sessionData: CreateSessionDto = {
      clientId: clientId, // Usar el ID del cliente autenticado
      sessionDatetime: createSessionWithDetailDto.sessionDatetime,
      sessionStatus:
        createSessionWithDetailDto.sessionStatus !== undefined
          ? createSessionWithDetailDto.sessionStatus
          : defaultClientSessionStatus,
      totalCost: totalSessionCost,
      totalTime: totalSessionTime,
      iaResponse: createSessionWithDetailDto.iaResponse,
      startDatetime:
        createSessionWithDetailDto.startDatetime ||
        createSessionWithDetailDto.sessionDatetime ||
        new Date(),
      status:
        createSessionWithDetailDto.status !== undefined
          ? createSessionWithDetailDto.status
          : 1,
      description: createSessionWithDetailDto.description,
      descriptionIA: createSessionWithDetailDto.descriptionIA,
    };

    console.log('📝 Cliente creando sesión con datos:', {
      clientId: sessionData.clientId,
      sessionDatetime: sessionData.sessionDatetime,
      startDatetime: sessionData.startDatetime,
      totalCost: sessionData.totalCost,
      totalTime: sessionData.totalTime,
    });

    // 8. Verificar si ya existe una sesión con los mismos datos
    const existingSession = await this.checkExistingSession(sessionData);

    if (existingSession) {
      const existingDetails: SessionDetail[] = [];

      for (const validation of serviceValidations) {
        if (
          validation.detail.companyWorkerId === null ||
          validation.detail.companyWorkerId === undefined
        ) {
          continue;
        }
        const existingDetail = await this.checkExistingSessionDetail(
          existingSession.id,
          validation.detail.serviceId,
          validation.detail.companyWorkerId,
        );

        if (existingDetail) {
          existingDetails.push(existingDetail);
        }
      }

      if (
        existingDetails.length === createSessionWithDetailDto.details.length
      ) {
        throw new BadRequestException({
          message: `Ya tienes una sesión con los mismos datos y todos los servicios ya están asignados.`,
          existingSession,
          existingDetails,
          recommendation:
            'Si desea modificar la sesión existente, use el endpoint de actualización.',
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
        existingSession: existingSession,
      };
    }

    // 9. Crear la sesión - usar el método create sin adminId para clientes
    const session = await this.createSessionForClient(sessionData);
    const isNew = true;
    const createdDetails: SessionDetail[] = [];

    // Actualizar automáticamente el estado de la sesión basado en los detalles
    try {
      await this.updateSessionStatusBasedOnDetails(session.id);
      console.log(
        `✅ Estado de sesión del cliente actualizado automáticamente basado en ${createdDetails.length} detalle(s)`,
      );
    } catch (error) {
      console.warn(
        `⚠️ No se pudo actualizar automáticamente el estado de la sesión del cliente: ${(error as Error).message}`,
      );
    }

    // 10. Crear los detalles de sesión
    for (const validation of serviceValidations) {
      const { detail, service, calculatedAmounts, detailTime } = validation;

      // CLYP-311: persistir endDatetime (fin explícito o inicio + duración) para
      // que el calendario tenga el fin de cada servicio.
      const detailStart = detail.detailStartDatetime || session.startDatetime;
      const detailEnd = this.resolveDetailEnd(
        detailStart,
        detail.detailEndDatetime,
        detailTime,
      );

      const sessionDetailData: DeepPartial<SessionDetail> = {
        cost: calculatedAmounts.cost,
        serviceId: detail.serviceId,
        companyWorkerId: (detail.companyWorkerId ?? null) as unknown as number,
        sessionId: session.id,
        startDatetime: detailStart,
        totalTime: detailTime,
        endDatetime: detailEnd,
        // Hora agendada original: se fija aquí y no se mueve con Comenzar/
        // Terminar ni con el arrastre (ripple).
        originalStartDatetime: detailStart,
        originalEndDatetime: detailEnd,
        totalWorker: calculatedAmounts.totalWorker,
        totalCompany: calculatedAmounts.totalCompany,
        status: detail.detailStatus !== undefined ? detail.detailStatus : 1,
        offerId: detail.offerId ?? undefined,
        description: detail.description ?? undefined,
        descriptionIA: detail.descriptionIA ?? undefined,
      };

      try {
        const sessionDetail =
          this.sessionDetailRepository.create(sessionDetailData);
        const savedSessionDetail =
          await this.sessionDetailRepository.save(sessionDetail);
        createdDetails.push(savedSessionDetail);
      } catch (error) {
        // Si falla algún detalle, eliminar todo lo creado
        if (createdDetails.length > 0) {
          await this.sessionDetailRepository.remove(createdDetails);
        }

        await this.sessionRepository.delete({
          id: session.id,
          clientId: session.clientId,
        });

        throw new BadRequestException(
          `Error al crear el detalle para el servicio ${service.name}: ${(error as Error).message}`,
        );
      }
    }

    // Correos de la cita (uno solo, con todos los servicios) en segundo plano.
    this.sendConfirmationEmails(
      session,
      createdDetails,
      clientId,
      companyId,
    ).catch((error) => {
      this.logger.error(
        `Error enviando correos de confirmación: ${(error as Error).message}`,
      );
    });

    // 11. Verificar y actualizar las compañías del cliente
    let wasAlreadyAssociated = false;
    let companiesBefore: number[] = [];
    let companiesAfter: number[] = [];

    companiesBefore = client.companies || [];
    const targetCompanyId = Number(companyId);

    // Registrar la fecha de la primera cita del cliente con esta compañía.
    // Solo se guarda una vez (la PRIMERA cita); citas posteriores no la pisan.
    const firstAppointments = Array.isArray(client.companyFirstAppointments)
      ? client.companyFirstAppointments
      : [];
    const hasFirstAppointment = firstAppointments.some(
      (fa) => Number(fa.companyId) === targetCompanyId,
    );
    const updatedFirstAppointments = hasFirstAppointment
      ? firstAppointments
      : [
          ...firstAppointments,
          {
            companyId: targetCompanyId,
            firstAppointmentDate: session.startDatetime,
          },
        ];

    const isNewCompany = !companiesBefore.includes(targetCompanyId);
    const updatedCompanies = isNewCompany
      ? [...companiesBefore, targetCompanyId]
      : companiesBefore;
    companiesAfter = updatedCompanies;

    if (isNewCompany || !hasFirstAppointment) {
      await this.clientRepository.update(client.id, {
        companies: updatedCompanies,
        companyFirstAppointments: updatedFirstAppointments,
      });
    }

    if (isNewCompany) {
      wasAlreadyAssociated = false;
      console.log(`✅ Cliente ${client.id} asociado a compañía ${companyId}`);
    } else {
      wasAlreadyAssociated = true;
      console.log(
        `ℹ️ Cliente ${client.id} ya estaba asociado a compañía ${companyId}`,
      );
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
      createdDetails,
    };
  }

  /**
   * Método para crear sesión sin validación de administrador (para clientes)
   */
  async createSessionForClient(
    createSessionDto: CreateSessionDto,
  ): Promise<Session> {
    const existingSession = await this.checkExistingSession(createSessionDto);

    if (existingSession) {
      throw new BadRequestException({
        message: 'Ya existe una cita con los mismos datos',
        existingSession: existingSession,
        duplicateData: {
          clientId: createSessionDto.clientId,
          sessionDatetime: createSessionDto.sessionDatetime,
          sessionStatus: createSessionDto.sessionStatus,
        },
      });
    }

    const sessionData = {
      ...createSessionDto,
      sessionStatus:
        createSessionDto.sessionStatus !== undefined
          ? createSessionDto.sessionStatus
          : 1,
      status:
        createSessionDto.status !== undefined ? createSessionDto.status : 1,
      startDatetime:
        createSessionDto.startDatetime ||
        createSessionDto.sessionDatetime ||
        new Date(),
    };

    console.log('📝 Datos de sesión a crear (cliente):', {
      sessionDatetime: createSessionDto.sessionDatetime,
      startDatetime: sessionData.startDatetime,
      sessionData: sessionData,
    });

    const session = this.sessionRepository.create(sessionData);
    return await this.sessionRepository.save(session);
  }
  // En el SessionService
  async syncSessionStatusFromDetails(
    sessionId: number,
    adminId: number,
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
    console.log(
      `🔄 Sincronizando estado de sesión ${sessionId} desde detalles`,
    );

    // 1. Verificar permisos
    const adminCompany = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!adminCompany) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    // 2. Verificar que la sesión pertenezca a la compañía del administrador
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    const sessionDetails = await this.sessionDetailRepository.find({
      where: { sessionId: sessionId },
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
      throw new ForbiddenException(
        'No tienes permiso para modificar esta sesión',
      );
    }

    // 3. Actualizar el estado basado en detalles
    const syncResult = await this.updateSessionStatusBasedOnDetails(sessionId);

    // 4. Obtener estadísticas de detalles
    const sessionDetailsUpdated = await this.sessionDetailRepository.find({
      where: { sessionId: sessionId },
    });

    const detailsSummary = {
      total: sessionDetailsUpdated.length,
      scheduled: sessionDetailsUpdated.filter((d) => d.status === 1).length,
      inProcess: sessionDetailsUpdated.filter((d) => d.status === 2).length,
      completed: sessionDetailsUpdated.filter((d) => d.status === 3).length,
    };

    // 5. Obtener la sesión actualizada
    const updatedSession = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!updatedSession) {
      throw new NotFoundException(
        `Sesión con ID ${sessionId} no encontrada después de la sincronización`,
      );
    }

    return {
      message: syncResult.updated
        ? `Estado de sesión sincronizado: ${this.getSessionStatusText(syncResult.previousStatus)} → ${this.getSessionStatusText(syncResult.newStatus)}`
        : `Estado de sesión ya está sincronizado: ${this.getSessionStatusText(syncResult.previousStatus)}`,
      session: updatedSession,
      syncResult,
      detailsSummary,
    };
  }

  async addExtraServicesToSession(
    sessionId: number,
    addExtraServicesDto: AddExtraServicesDto,
    userId: number,
    userRole?: string,
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

    // 1. Buscar la sesión
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // 2. Obtener la compañía (necesaria para validaciones posteriores)
    let adminCompany: any = null;

    if (userRole === 'cli') {
      const client = await this.clientRepository.findOne({
        where: { userId },
      });
      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }
      if (session.clientId !== client.id) {
        throw new ForbiddenException(
          'No tienes permiso para modificar esta sesión',
        );
      }
      // Obtener la compañía a partir de los detalles de la sesión
      const firstDetail = await this.sessionDetailRepository.findOne({
        where: { sessionId: sessionId },
      });
      if (firstDetail) {
        const cw = await this.companyWorkerRepository.findOne({
          where: { id: firstDetail.companyWorkerId },
          relations: ['company'],
        });
        adminCompany = cw?.company || null;
      }
    } else if (userRole === 'wrk') {
      const workerCws = await this.companyWorkerRepository.find({
        where: { userId, isActive: 1 },
        relations: ['company'],
      });
      if (workerCws.length === 0) {
        throw new ForbiddenException(
          'El trabajador no tiene una compañía activa',
        );
      }
      const workerCwIds = new Set(workerCws.map((cw) => cw.id));

      const sessionDetails = await this.sessionDetailRepository.find({
        where: { sessionId },
      });
      const ownDetail = sessionDetails.find(
        (d) => d.companyWorkerId != null && workerCwIds.has(d.companyWorkerId),
      );
      if (!ownDetail) {
        throw new ForbiddenException(
          'No tienes permiso para modificar esta sesión',
        );
      }
      const owningCw = workerCws.find(
        (cw) => cw.id === ownDetail.companyWorkerId,
      );
      adminCompany = owningCw?.company || null;
      if (!adminCompany) {
        throw new NotFoundException(
          'El trabajador no tiene una compañía asignada',
        );
      }
    } else {
      adminCompany = await this.companyRepository.findOne({
        where: { userId: userId },
      });

      if (!adminCompany) {
        throw new NotFoundException(
          'El administrador no tiene una compañía asignada',
        );
      }

      const sessionDetails = await this.sessionDetailRepository.find({
        where: { sessionId: sessionId },
      });

      if (sessionDetails.length === 0) {
        throw new NotFoundException(`La sesión ${sessionId} no tiene detalles`);
      }

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
        throw new ForbiddenException(
          'No tienes permiso para modificar esta sesión',
        );
      }
    }

    // 3. Validar que haya servicios extras para agregar
    if (
      !addExtraServicesDto.extraServices ||
      addExtraServicesDto.extraServices.length === 0
    ) {
      throw new BadRequestException(
        'Debe proporcionar al menos un servicio extra',
      );
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

    // 7. Pre-validar y calcular todos los servicios extras
    for (const extraService of addExtraServicesDto.extraServices) {
      // Validar que el servicio exista
      const service = await this.serviceRepository.findOne({
        where: {
          id: extraService.serviceId,
          companyId: adminCompany.id,
        },
      });

      if (!service) {
        throw new NotFoundException(
          `Servicio con ID ${extraService.serviceId} no encontrado o no pertenece a tu compañía`,
        );
      }

      // Validar que el trabajador (providerId = companyWorkerId) exista y esté activo
      const companyWorker = await this.companyWorkerRepository.findOne({
        where: {
          id: extraService.providerId,
          companyId: adminCompany.id,
        },
        relations: ['worker'],
      });

      if (!companyWorker) {
        throw new NotFoundException(
          `Trabajador con ID ${extraService.providerId} no encontrado o no pertenece a tu compañía`,
        );
      }

      if (companyWorker.isActive !== 1) {
        throw new BadRequestException(
          `El trabajador con ID ${extraService.providerId} no está activo`,
        );
      }

      // ========================================================================
      // PRIORIDAD 1: Buscar configuración específica en service.workers[]
      // ========================================================================
      console.log(
        `🔍 Buscando configuración para trabajador ${extraService.providerId} en servicio ${service.id}`,
      );
      console.log(`📋 Array workers del servicio:`, service.workers);

      let workerPercentage = 0;
      let companyPercentage = 0;
      let detailTime = service.standardTime || 0;
      let configSource = '';
      let workerAssigned = false;

      // Buscar en el array workers del servicio
      if (
        service.workers &&
        Array.isArray(service.workers) &&
        service.workers.length > 0
      ) {
        const workerConfig = service.workers.find(
          (w: any) => w.id === extraService.providerId,
        );

        if (workerConfig) {
          console.log(
            `✅ Encontrada configuración específica para trabajador ${extraService.providerId}:`,
            workerConfig,
          );

          // PRIORIDAD: Usar porcentaje del worker si existe
          if (
            workerConfig.percentage !== undefined &&
            workerConfig.percentage !== null
          ) {
            workerPercentage = Number(workerConfig.percentage);
            workerAssigned = true;
            configSource = 'workers_array_percentage';
            console.log(
              `📊 Usando porcentaje de workers[]: ${workerPercentage}%`,
            );
          }

          // PRIORIDAD: Usar tiempo del worker si existe
          if (workerConfig.time !== undefined && workerConfig.time !== null) {
            detailTime = Number(workerConfig.time);
            configSource = configSource
              ? `${configSource}, workers_array_time`
              : 'workers_array_time';
            console.log(
              `⏱️  Usando tiempo de workers[]: ${detailTime} minutos`,
            );
          }
        } else {
          console.log(
            `⚠️  Trabajador ${extraService.providerId} NO encontrado en workers[], usando config general`,
          );
        }
      } else {
        console.log(
          `ℹ️  Servicio ${service.id} no tiene array workers[], usando config general`,
        );
      }

      // ========================================================================
      // PRIORIDAD 2: Si no hay configuración específica, usar valores generales
      // ========================================================================
      if (!workerAssigned) {
        if (service.percentage !== undefined && service.percentage !== null) {
          workerPercentage = Number(service.percentage);
          configSource = 'service_general_percentage';
          console.log(
            `📊 Usando porcentaje general del servicio: ${workerPercentage}%`,
          );
        } else {
          throw new BadRequestException(
            `El servicio "${service.name}" (ID: ${service.id}) no tiene configurado el porcentaje para el trabajador ${extraService.providerId}. ` +
              `Debe estar en service.workers[] o en service.percentage`,
          );
        }
      }

      // Si no se encontró tiempo específico, validar que exista tiempo estándar
      if (!configSource.includes('workers_array_time')) {
        if (
          service.standardTime !== undefined &&
          service.standardTime !== null
        ) {
          detailTime = Number(service.standardTime);
          configSource = configSource
            ? `${configSource}, service_standard_time`
            : 'service_standard_time';
          console.log(
            `⏱️  Usando tiempo estándar del servicio: ${detailTime} minutos`,
          );
        } else {
          console.warn(
            `⚠️  Servicio ${service.id} no tiene tiempo configurado, usando 0`,
          );
          detailTime = 0;
        }
      }

      // Si el frontend envía durationMinutes, puede sobrescribir (opcional)
      if (
        extraService.durationMinutes !== undefined &&
        extraService.durationMinutes !== null
      ) {
        console.log(
          `🔧 Frontend especificó duración: ${extraService.durationMinutes} minutos (sobrescribiendo ${detailTime})`,
        );
        detailTime = extraService.durationMinutes;
        configSource = configSource
          ? `${configSource}, frontend_override`
          : 'frontend_override';
      }

      companyPercentage = 100 - workerPercentage;

      // Validar porcentajes
      this.validateServicePercentagesAndTime(service);

      if (workerPercentage < 0 || workerPercentage > 100) {
        throw new BadRequestException(
          `El porcentaje del trabajador (${workerPercentage}%) debe estar entre 0 y 100 para el servicio "${service.name}"`,
        );
      }

      if (companyPercentage < 0 || companyPercentage > 100) {
        throw new BadRequestException(
          `El porcentaje de la compañía (${companyPercentage}%) debe estar entre 0 y 100 para el servicio "${service.name}"`,
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
          if (
            extraService.customPrice === undefined ||
            extraService.customPrice === null
          ) {
            throw new BadRequestException(
              `Debe proporcionar customPrice cuando priceOption es "custom" para el servicio ${service.name}`,
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
            `priceOption inválido: ${extraService.priceOption}. Debe ser "default", "custom" o "free"`,
          );
      }

      if (finalPrice < 0) {
        throw new BadRequestException(
          `El precio del servicio "${service.name}" no puede ser negativo`,
        );
      }

      // Calcular montos (trabajador/compañía)
      const calculatedAmounts = this.calculateAmounts(
        finalPrice,
        workerPercentage,
        companyPercentage,
      );

      let startDatetime: Date;
      if (extraService.startDatetime) {
        startDatetime = new Date(extraService.startDatetime);
        if (isNaN(startDatetime.getTime())) {
          throw new BadRequestException(
            `startDatetime inválido para el servicio ${service.name}`,
          );
        }
      } else if (extraService.date && extraService.time) {
        try {
          const dateTimeParts = `${extraService.date} ${extraService.time}`;
          startDatetime = new Date(dateTimeParts);
          if (isNaN(startDatetime.getTime())) {
            throw new Error('Fecha inválida');
          }
        } catch {
          throw new BadRequestException(
            `Formato de fecha/hora inválido para el servicio ${service.name}: date="${extraService.date}", time="${extraService.time}"`,
          );
        }
      } else {
        throw new BadRequestException(
          `Debe enviar startDatetime (UTC) o date+time para el servicio ${service.name}`,
        );
      }

      // Verificar si el mismo servicio ya existe en esta sesión con horario solapado
      const existingSessionDetails = await this.sessionDetailRepository.find({
        where: { sessionId: session.id, serviceId: extraService.serviceId },
      });

      const newStart = new Date(startDatetime).getTime();
      const newEnd = newStart + detailTime * 60000;

      for (const existingDetail of existingSessionDetails) {
        if (existingDetail.status === 5) continue; // Ignorar cancelados
        const existStart = new Date(existingDetail.startDatetime).getTime();
        const existEnd = existStart + (existingDetail.totalTime || 0) * 60000;

        if (newStart < existEnd && newEnd > existStart) {
          throw new BadRequestException(
            `El servicio "${service.name}" ya está asignado en esta sesión en un horario que se solapa (${new Date(existingDetail.startDatetime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIMEZONE })}). No se puede agregar el mismo servicio dos veces en el mismo horario.`,
          );
        }
      }

      // Verificar si el trabajador ya tiene una cita que se solape con este horario
      const workerConflict = await this.checkIfWorkerHasAppointmentAtSameTime(
        extraService.providerId,
        startDatetime,
        detailTime,
        session.id, // Excluir la sesión actual
      );

      if (workerConflict) {
        const conflictStart = new Date(workerConflict.startDatetime);
        const workerName = companyWorker.worker
          ? (companyWorker.worker.name || '').trim()
          : `Trabajador ID: ${companyWorker.id}`;
        throw new BadRequestException(
          `El trabajador "${workerName}" ya tiene una cita asignada que se solapa con el horario seleccionado (${conflictStart.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIMEZONE })}). Por favor, seleccione otro horario o trabajador.`,
        );
      }

      // Acumular totales
      extraTotalCost += calculatedAmounts.cost;

      const workerName = companyWorker.worker
        ? (companyWorker.worker.name || '').trim()
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
        configSource,
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
        configSource, // NUEVO: indica de dónde salió la config
      });
    }

    // 8. Iniciar transacción para crear detalles y actualizar sesión
    const queryRunner =
      this.sessionRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const addedDetails: SessionDetail[] = [];

    try {
      // 9. Crear los SessionDetail con isExtra: true
      for (const validation of validations) {
        const { extraService, calculatedAmounts, detailTime, startDatetime } =
          validation;

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
          isExtra: true, // Marcar como servicio extra
          description: extraService.description ?? undefined,
          descriptionIA: extraService.descriptionIA ?? undefined,
        };

        const sessionDetail =
          this.sessionDetailRepository.create(sessionDetailData);
        const savedDetail = await queryRunner.manager.save(sessionDetail);
        addedDetails.push(savedDetail);
      }

      // 10. Actualizar los totales de la sesión
      const newTotalCost = previousTotalCost + extraTotalCost;

      // Calcular tiempo total real considerando solapamiento entre todos los detalles
      const existingDetails = await this.sessionDetailRepository.find({
        where: { sessionId: session.id },
      });
      const allDetails = [
        ...existingDetails
          .filter((d) => d.status !== 5) // Excluir cancelados
          .map((d) => ({
            startDatetime: d.startDatetime,
            totalTime: d.totalTime || 0,
          })),
        ...validations.map((v) => ({
          startDatetime: v.startDatetime,
          totalTime: v.detailTime,
        })),
      ];
      const newTotalTime = this.calculateRealTotalTime(allDetails);

      await queryRunner.manager.update(
        Session,
        { id: session.id, clientId: session.clientId },
        {
          totalCost: newTotalCost,
          totalTime: newTotalTime,
        },
      );

      // 11. Actualizar el campo extra_services en la sesión
      const existingExtraServices = session.extraServices || [];

      const newExtraServices = addExtraServicesDto.extraServices.map(
        (es, index) => {
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
            ...(es.customPrice !== undefined && {
              customPrice: es.customPrice,
            }),
            ...(es.description !== undefined && {
              description: es.description,
            }),
            ...(es.descriptionIA !== undefined && {
              descriptionIA: es.descriptionIA,
            }),
            createdAt: es.createdAt || new Date().toISOString(),
          };
        },
      );

      const updatedExtraServices = [
        ...existingExtraServices,
        ...newExtraServices,
      ];

      await queryRunner.manager.update(
        Session,
        { id: session.id, clientId: session.clientId },
        {
          extraServices: updatedExtraServices,
        },
      );

      // 12. Commit de la transacción
      await queryRunner.commitTransaction();

      console.log(
        `✅ ${addedDetails.length} servicio(s) extra(s) agregado(s) a la sesión ${sessionId}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new BadRequestException(
        `Error al agregar servicios extras: ${(error as Error).message}`,
      );
    } finally {
      await queryRunner.release();
    }

    // 13. Obtener la sesión actualizada
    const updatedSession = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!updatedSession) {
      throw new NotFoundException(
        `Sesión con ID ${sessionId} no encontrada después de actualizar`,
      );
    }

    // 14. Enviar UN correo con todos los servicios extras agregados (segundo
    //     plano, no bloquea la respuesta).
    this.sendConfirmationEmails(
      updatedSession,
      addedDetails,
      session.clientId,
      adminCompany.id,
    ).catch((error) => {
      this.logger.warn(
        `⚠️ Error enviando correos para servicios extras: ${(error as Error).message}`,
      );
    });

    // 15. Actualizar automáticamente el estado de la sesión
    try {
      await this.updateSessionStatusBasedOnDetails(sessionId);
      console.log(
        `✅ Estado de sesión actualizado automáticamente después de agregar servicios extras`,
      );
    } catch (error) {
      console.warn(
        `⚠️ No se pudo actualizar automáticamente el estado de la sesión: ${(error as Error).message}`,
      );
    }

    // 16. Retornar resultado
    return {
      message: `Se agregaron ${addedDetails.length} servicio(s) extra(s) a la sesión exitosamente`,
      session: updatedSession,
      addedDetails,
      calculations,
      previousTotals: {
        totalCost: previousTotalCost,
        totalTime: previousTotalTime,
      },
      newTotals: {
        totalCost: Number(updatedSession.totalCost),
        totalTime: Number(updatedSession.totalTime),
      },
    };
  }

  /**
   * Cancela una sesión (cita) y todos sus detalles, tanto para administradores como para clientes.
   * @param sessionId ID de la sesión a cancelar
   * @param userId ID del usuario que realiza la acción (admin o cliente)
   * @param userRole Rol del usuario: 'adm' o 'cli'
   * @param cancelDto Opcional: motivo de cancelación
   */
  /**
   * El cliente confirma (o rechaza) su asistencia a la cita, desde el popup del
   * recordatorio (CLYP-264). Valida que la cita sea del cliente autenticado.
   * attendanceStatus: 1 = confirma, 2 = no asistirá.
   */
  async confirmAttendance(
    sessionId: number,
    userId: number,
    attending: boolean,
  ): Promise<{ success: true; attendanceStatus: number }> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`Cita con ID ${sessionId} no encontrada`);
    }

    const client = await this.clientRepository.findOne({
      where: { id: session.clientId },
    });
    if (!client || client.userId !== userId) {
      throw new ForbiddenException('Esta cita no te pertenece');
    }

    session.attendanceStatus = attending ? 1 : 2;
    session.attendanceRespondedAt = new Date();
    await this.sessionRepository.save(session);

    return { success: true, attendanceStatus: session.attendanceStatus };
  }

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
    this.logger.log(
      `🛑 Cancelando sesión ${sessionId} por ${userRole} (userId: ${userId})`,
    );

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
    if (
      session.sessionStatus === 3 ||
      session.sessionStatus === 4 ||
      session.sessionStatus === 6
    ) {
      throw new BadRequestException(
        'No se puede cancelar una sesión completada, pagada o calificada',
      );
    }

    // 3. Validar permisos según el rol
    if (userRole === 'adm') {
      const adminCompany = await this.companyRepository.findOne({
        where: { userId },
      });
      if (!adminCompany) {
        throw new NotFoundException(
          'El administrador no tiene una compañía asignada',
        );
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
        throw new ForbiddenException(
          'No tienes permiso para cancelar esta sesión',
        );
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
        throw new ForbiddenException(
          'No puedes cancelar una cita que no te pertenece',
        );
      }
    }

    // 4. Iniciar transacción
    const queryRunner =
      this.sessionRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const reason = cancelDto?.reason ?? null;

    try {
      // 5. Actualizar estado de la sesión a 5 = Cancelada + guardar el motivo
      //    y registrar quién la canceló (admin o cliente).
      session.sessionStatus = 5;
      session.cancellationReason = reason;
      session.cancelledBy = userRole;
      const updatedSession = await queryRunner.manager.save(session);

      // 6. Actualizar todos los detalles de la sesión a 5 = Cancelado
      //    y propagar el mismo motivo de cancelación y autor a cada servicio.
      const updateResult = await queryRunner.manager
        .createQueryBuilder()
        .update(SessionDetail)
        .set({ status: 5, cancelReason: reason, cancelledBy: userRole })
        .where('sessionId = :sessionId', { sessionId })
        .execute();

      await queryRunner.commitTransaction();

      this.logger.log(
        `✅ Sesión ${sessionId} cancelada, ${updateResult.affected} detalle(s) actualizados`,
      );

      // 7. Enviar correos de cancelación (asíncrono, no bloquea)
      this.sendCancellationEmails(session, cancelDto?.reason).catch((error) => {
        this.logger.error(
          `Error enviando correos de cancelación: ${error.message}`,
        );
      });

      return {
        message: 'Cita cancelada exitosamente',
        session: updatedSession,
        cancelledDetailsCount: updateResult.affected || 0,
        reason: cancelDto?.reason,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `❌ Error cancelando sesión: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new BadRequestException(
        `Error al cancelar la sesión: ${(error as Error).message}`,
      );
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
      const formatted = this.emailService.formatSessionDate(
        session.sessionDatetime,
      );

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
        this.logger.log(
          `✅ Correo de cancelación enviado al cliente: ${clientInfo.email}`,
        );
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
          (companyWorker.worker.name || '').trim(),
          {
            date: formatted.date,
            time: formatted.time,
            serviceName: service?.name || 'Servicio',
            clientName: clientInfo.name,
            reason: reason || 'No se especificó motivo',
          },
        );
        this.logger.log(
          `✅ Correo de cancelación enviado al trabajador: ${workerEmail}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ Error enviando correos de cancelación: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Cancela automáticamente todas las citas agendadas (sessionStatus = 1)
   * cuya fecha programada ya pasó (sessionDatetime < hoy 00:00). Marca la
   * sesión y todos sus session_detail con status 5 (Cancelado).
   *
   * Pensado para ejecutarse en un cron diario a medianoche: si una cita
   * del día anterior nunca avanzó al siguiente estado, se da por cancelada.
   *
   * @returns cantidad de sesiones canceladas y detalles actualizados
   */
  async cancelExpiredScheduledSessions(): Promise<{
    cancelledSessions: number;
    cancelledDetails: number;
  }> {
    const now = new Date();

    // Estados de cita "pendiente" que deben auto-cancelarse al vencer:
    //   1 = Agendado, 8 = Pendiente de asignación de trabajador.
    // Los estados que ya representan una cita atendida o cerrada
    // (3 Completada, 4 Pagado, 5 Cancelada, 6 Calificada) no se tocan.
    const cancellableStatuses = [1, 8];

    const expiredSessions = await this.sessionRepository
      .createQueryBuilder('session')
      .where('session.session_status IN (:...statuses)', {
        statuses: cancellableStatuses,
      })
      .andWhere('session.session_datetime < :now', { now })
      .getMany();

    if (expiredSessions.length === 0) {
      return { cancelledSessions: 0, cancelledDetails: 0 };
    }

    const sessionIds = expiredSessions.map((s) => s.id);

    const queryRunner =
      this.sessionRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const sessionUpdate = await queryRunner.manager
        .createQueryBuilder()
        .update(Session)
        .set({ sessionStatus: 5, cancelledBy: 'system' })
        .whereInIds(sessionIds)
        .execute();

      const detailUpdate = await queryRunner.manager
        .createQueryBuilder()
        .update(SessionDetail)
        .set({ status: 5, cancelledBy: 'system' })
        .where('sessionId IN (:...sessionIds)', { sessionIds })
        .execute();

      await queryRunner.commitTransaction();

      this.logger.log(
        `🛑 Auto-cancelación: ${sessionUpdate.affected ?? 0} sesión(es) y ${detailUpdate.affected ?? 0} detalle(s) marcados como cancelados (IDs: ${sessionIds.join(', ')})`,
      );

      return {
        cancelledSessions: sessionUpdate.affected ?? 0,
        cancelledDetails: detailUpdate.affected ?? 0,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `❌ Error en auto-cancelación de citas vencidas: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    } finally {
      await queryRunner.release();
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
    getSessionsDto: GetSessionsDto,
  ): Promise<PaginationResult<any> & { client: any }> {
    console.log(
      `👤 Obteniendo sesiones para cliente autenticado (userId: ${clientUserId})`,
    );

    // 1. Obtener el cliente a partir del userId
    const client = await this.clientRepository.findOne({
      where: { userId: clientUserId },
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
      .leftJoin(
        'company_worker',
        'companyWorker',
        'companyWorker.id = detail.company_worker_id',
      )
      .leftJoin('worker', 'worker', 'worker.id = companyWorker.worker_id')
      .leftJoin('company', 'company', 'company.id = service.company_id')
      .leftJoin('offer', 'offer', 'offer.id = detail.offer_id')
      .leftJoin(
        'service_offer',
        'serviceOffer',
        'serviceOffer.offer_id = detail.offer_id AND serviceOffer.service_id = detail.service_id',
      )
      .select([
        // Campos de la sesión
        'session.id AS sessionId',
        'session.client_id AS clientId',
        'session.session_datetime AS sessionDatetime',
        'session.session_status AS sessionStatus',
        'session.total_cost AS sessionTotalCost',
        'session.total_time AS sessionTotalTime',
        'session.start_datetime AS sessionStartDatetime',
        'session.original_start_datetime AS sessionOriginalStartDatetime',
        'session.status AS sessionStatusFlag',
        'session.ia_response AS iaResponse',
        'session.updated_at AS sessionUpdatedAt',
        'session.description_ia AS descriptionIA',
        'session.description AS description',
        'session.extra_services AS extraServices',
        'session.cancellation_reason AS sessionCancellationReason',
        'session.cancelled_by AS sessionCancelledBy',

        // Campos del detalle (servicio)
        'detail.id AS detailId',
        'detail.cost AS cost',
        'detail.total_time AS totalTime',
        'detail.total_worker AS totalWorker',
        'detail.total_company AS totalCompany',
        'detail.status AS detailStatus',
        'detail.start_datetime AS detailStartDatetime',
        'detail.end_datetime AS detailEndDatetime',
        'detail.original_start_datetime AS detailOriginalStartDatetime',
        'detail.original_end_datetime AS detailOriginalEndDatetime',
        'detail.is_extra AS isExtra',
        'detail.is_courtesy AS isCourtesy',
        'detail.offer_id AS detailOfferId',
        'detail.description AS detailDescription',
        'detail.description_ia AS detailDescriptionIA',
        'detail.cancel_reason AS detailCancelReason',
        'detail.cancelled_by AS detailCancelledBy',

        // Campos del servicio
        'service.id AS serviceId',
        'service.name AS serviceName',
        'service.description AS serviceDescription',
        'service.currency AS serviceCurrency',
        'service.cost AS serviceOriginalCost',
        'service.standard_time AS serviceStandardTime',

        // Campos de la oferta aplicada al detalle (si la hay)
        'offer.id AS offerId',
        'offer.name AS offerName',
        'offer.description AS offerDescription',
        'offer.start_date AS offerStartDate',
        'offer.end_date AS offerEndDate',
        'offer.logo AS offerLogo',
        'offer.status AS offerStatus',
        'serviceOffer.price AS offerSpecialPrice',

        // Compañía
        'companyWorker.id AS companyWorkerId',
        'company.id AS companyId',
        'company.name AS companyName',
        'company.location AS companyLocation',
        'company.address AS companyAddress',
        'company.email AS companyEmail',
        'company.phone AS companyPhone',
        'company.description AS companyDescription',
        'company.manager_name AS companyManagerName',
        'company.instagram_url AS companyInstagramUrl',
        'company.tiktok_url AS companyTiktokUrl',
        'company.facebook_url AS companyFacebookUrl',
        'company.logo AS companyLogo',

        // Trabajador
        'worker.id AS workerId',
        'worker.name AS workerName',
        'worker.phone AS workerPhone',
        'worker.address AS workerAddress',
        'worker.birthdate AS workerBirthdate',
        'worker.description AS workerDescription',
        'worker.is_active AS workerIsActive',
        'worker.location AS workerLocation',
        'worker.instagram_url AS workerInstagramUrl',
        'worker.tiktok_url AS workerTiktokUrl',
        'worker.facebook_url AS workerFacebookUrl',
        'worker.picture AS workerPicture',
      ])
      .where('session.client_id = :clientId', { clientId });

    // =========================================================================
    // FILTROS DE FECHA (sobre session.session_datetime)
    // =========================================================================

    // PRIORIDAD 1: Fecha específica
    if (getSessionsDto.date) {
      const { startOfDay, endOfDay } = businessDayBounds(getSessionsDto.date);
      query.andWhere(
        'session.session_datetime BETWEEN :startOfDay AND :endOfDay',
        { startOfDay, endOfDay },
      );
      console.log(`📅 Cliente: Filtrando por fecha ${getSessionsDto.date}`);
    }
    // PRIORIDAD 2: Día actual (en la zona del negocio)
    else if (getSessionsDto.today) {
      const { startOfDay, endOfDay } = businessDayBounds(businessToday());
      query.andWhere(
        'session.session_datetime BETWEEN :startOfDay AND :endOfDay',
        { startOfDay, endOfDay },
      );
      console.log(`📅 Cliente: Filtrando por día actual (${businessToday()})`);
    }
    // PRIORIDAD 3: Rango de fechas (inclusivo en ambos extremos).
    // Antes usaba `new Date(endDate)` = medianoche del último día, así que las
    // citas de ese día quedaban fuera. Aquí NO se aplica el tope de días: el
    // historial del cliente puede ser legítimamente largo.
    else if (getSessionsDto.startDate && getSessionsDto.endDate) {
      const { startOfDay, endOfDay } = this.toInclusiveDayRange(
        getSessionsDto.startDate,
        getSessionsDto.endDate,
      );
      query.andWhere(
        'session.session_datetime BETWEEN :startDate AND :endDate',
        { startDate: startOfDay, endDate: endOfDay },
      );
    }

    // FILTRO: Estado de la sesión (uno o varios)
    if (
      getSessionsDto.sessionStatus &&
      getSessionsDto.sessionStatus.length > 0
    ) {
      query.andWhere('session.session_status IN (:...sessionStatus)', {
        sessionStatus: getSessionsDto.sessionStatus,
      });
    }

    // FILTRO: Solo sesiones con estado "Agendado" (atajo)
    if (getSessionsDto.onlyScheduled) {
      query.andWhere('session.session_status = 1');
    }

    // FILTRO: Estado del detalle (uno o varios)
    if (getSessionsDto.detailStatus && getSessionsDto.detailStatus.length > 0) {
      query.andWhere('detail.status IN (:...detailStatus)', {
        detailStatus: getSessionsDto.detailStatus,
      });
    }

    // Ordenar por fecha de la sesión. Cuando today=true, forzar ASC (hora más temprana primero).
    const sessionOrder: 'ASC' | 'DESC' = getSessionsDto.today
      ? 'ASC'
      : getSessionsDto.orderBy === 'oldest'
        ? 'ASC'
        : 'DESC';
    query.orderBy('session.session_datetime', sessionOrder);

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
      const { startOfDay, endOfDay } = businessDayBounds(getSessionsDto.date);
      countQuery.andWhere(
        'session.session_datetime BETWEEN :startOfDay AND :endOfDay',
        { startOfDay, endOfDay },
      );
    } else if (getSessionsDto.today) {
      const { startOfDay, endOfDay } = businessDayBounds(businessToday());
      countQuery.andWhere(
        'session.session_datetime BETWEEN :startOfDay AND :endOfDay',
        { startOfDay, endOfDay },
      );
    } else if (getSessionsDto.startDate && getSessionsDto.endDate) {
      // Mismo rango inclusivo que la query principal, para que meta.total cuadre.
      const { startOfDay: rangeStart, endOfDay: rangeEnd } =
        this.toInclusiveDayRange(
          getSessionsDto.startDate,
          getSessionsDto.endDate,
        );
      countQuery.andWhere(
        'session.session_datetime BETWEEN :startDate AND :endDate',
        { startDate: rangeStart, endDate: rangeEnd },
      );
    }

    if (
      getSessionsDto.sessionStatus &&
      getSessionsDto.sessionStatus.length > 0
    ) {
      countQuery.andWhere('session.session_status IN (:...sessionStatus)', {
        sessionStatus: getSessionsDto.sessionStatus,
      });
    }
    if (getSessionsDto.onlyScheduled) {
      countQuery.andWhere('session.session_status = 1');
    }
    if (getSessionsDto.detailStatus && getSessionsDto.detailStatus.length > 0) {
      countQuery.andWhere('detail.status IN (:...detailStatus)', {
        detailStatus: getSessionsDto.detailStatus,
      });
    }

    const countResult = await countQuery
      .select('COUNT(DISTINCT session.id)', 'total')
      .getRawOne();

    const total = parseInt(countResult?.total || '0', 10);

    // =========================================================================
    // RATINGS DE LOS WORKERS (una sola query por todos los workers de la página)
    // =========================================================================
    const workerIds = Array.from(
      new Set(
        details
          .map((d) => d.workerId)
          .filter((id: any) => id !== null && id !== undefined),
      ),
    ) as number[];

    const ratingsByWorker = new Map<
      number,
      { averageStars: number; totalReviews: number }
    >();
    if (workerIds.length > 0) {
      const ratingRows = await this.sessionDetailRepository.manager
        .createQueryBuilder()
        .select('f.worker_id', 'workerId')
        .addSelect('AVG(f.stars)', 'avg')
        .addSelect('COUNT(f.id)', 'cnt')
        .from('worker_feedback', 'f')
        .where('f.worker_id IN (:...workerIds)', { workerIds })
        .groupBy('f.worker_id')
        .getRawMany();

      for (const r of ratingRows) {
        const avg = r.avg ? parseFloat(r.avg) : 0;
        ratingsByWorker.set(parseInt(r.workerId, 10), {
          averageStars: Math.round((avg + Number.EPSILON) * 100) / 100,
          totalReviews: parseInt(r.cnt, 10) || 0,
        });
      }
    }

    // =========================================================================
    // RATINGS DE LAS COMPAÑÍAS (una sola query agregada)
    // =========================================================================
    const companyIds = Array.from(
      new Set(
        details
          .map((d) => d.companyId)
          .filter((id: any) => id !== null && id !== undefined),
      ),
    ) as number[];

    const ratingsByCompany = new Map<
      number,
      { averageStars: number; totalReviews: number }
    >();
    if (companyIds.length > 0) {
      const companyRatingRows = await this.sessionDetailRepository.manager
        .createQueryBuilder()
        .select('f.company_id', 'companyId')
        .addSelect('AVG(f.stars)', 'avg')
        .addSelect('COUNT(f.id)', 'cnt')
        .from('company_feedback', 'f')
        .where('f.company_id IN (:...companyIds)', { companyIds })
        .groupBy('f.company_id')
        .getRawMany();

      for (const r of companyRatingRows) {
        const avg = r.avg ? parseFloat(r.avg) : 0;
        ratingsByCompany.set(parseInt(r.companyId, 10), {
          averageStars: Math.round((avg + Number.EPSILON) * 100) / 100,
          totalReviews: parseInt(r.cnt, 10) || 0,
        });
      }
    }

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
          // Dirección de la cita (dirección de la compañía)
          address: detail.companyAddress ?? null,
          startDatetime: detail.sessionStartDatetime,
          // Hora agendada original de la cita (para la tarjeta).
          originalStartDatetime: detail.sessionOriginalStartDatetime,
          status: detail.sessionStatusFlag,
          iaResponse: detail.iaResponse,
          descriptionIA: detail.descriptionIA,
          description: detail.description,
          extraServices: detail.extraServices,
          cancellationReason: detail.sessionCancellationReason ?? null,
          cancelledBy: detail.sessionCancelledBy ?? null,
          cancelledByText: this.getCancelledByText(detail.sessionCancelledBy),
          createdAt: detail.sessionUpdatedAt,

          // Servicios de la sesión
          services: [],
          // Totales calculados (se actualizarán)
          totalCost: 0,
          // Tiempo estimado total del trabajador para la cita (suma de durationWorker)
          workerEstimateTime: 0,
          // Duración real total de la cita (suma de realDuration de cada servicio)
          realTotalTime: 0,
          servicesCount: 0,
        });
      }

      const sessionData = sessionMap.get(sessionId);

      const cost = parseFloat(detail.cost) || 0;
      const totalTime = parseFloat(detail.totalTime) || 0;
      const realTime = this.calculateRealTimeRaw(
        detail.detailStatus,
        detail.detailStartDatetime,
        detail.detailEndDatetime,
      );
      const totalWorker = parseFloat(detail.totalWorker) || 0;
      const totalCompany = parseFloat(detail.totalCompany) || 0;

      // Calcular porcentajes
      let workerPercentage = 0;
      let companyPercentage = 0;
      if (cost > 0) {
        workerPercentage = parseFloat(((totalWorker / cost) * 100).toFixed(2));
        companyPercentage = parseFloat(
          ((totalCompany / cost) * 100).toFixed(2),
        );
      }

      const rating = ratingsByWorker.get(detail.workerId) || {
        averageStars: 0,
        totalReviews: 0,
      };

      const workerObj = detail.workerId
        ? {
            id: detail.workerId,
            name: detail.workerName,
            phone: detail.workerPhone,
            address: detail.workerAddress,
            birthdate: detail.workerBirthdate,
            description: detail.workerDescription,
            isActive: detail.workerIsActive,
            location: detail.workerLocation,
            instagramUrl: detail.workerInstagramUrl,
            tiktokUrl: detail.workerTiktokUrl,
            facebookUrl: detail.workerFacebookUrl,
            photoUrl: detail.workerPicture
              ? this.fileUploadService.getFileUrl(
                  'worker_photo',
                  detail.workerPicture,
                )
              : null,
            rating: {
              averageStars: rating.averageStars,
              totalReviews: rating.totalReviews,
            },
          }
        : null;

      const companyRating = ratingsByCompany.get(detail.companyId) || {
        averageStars: 0,
        totalReviews: 0,
      };

      const companyObj = detail.companyId
        ? {
            id: detail.companyId,
            name: detail.companyName,
            location: detail.companyLocation,
            email: detail.companyEmail,
            phone: detail.companyPhone,
            description: detail.companyDescription,
            managerName: detail.companyManagerName,
            instagramUrl: detail.companyInstagramUrl,
            tiktokUrl: detail.companyTiktokUrl,
            facebookUrl: detail.companyFacebookUrl,
            logoUrl: detail.companyLogo
              ? this.fileUploadService.getFileUrl(
                  'company_logo',
                  detail.companyLogo,
                )
              : null,
            rating: {
              averageStars: companyRating.averageStars,
              totalReviews: companyRating.totalReviews,
            },
          }
        : null;

      const originalPrice = parseFloat(detail.serviceOriginalCost) || 0;
      const offerPrice = parseFloat(detail.offerSpecialPrice) || 0;
      const hasOffer =
        detail.detailOfferId !== null && detail.detailOfferId !== undefined;
      const discountAmount = hasOffer
        ? Math.max(originalPrice - offerPrice, 0)
        : 0;
      const discountPercentage =
        hasOffer && originalPrice > 0
          ? parseFloat(((discountAmount / originalPrice) * 100).toFixed(2))
          : 0;

      const offerObj = hasOffer
        ? {
            id: detail.offerId,
            name: detail.offerName,
            description: detail.offerDescription,
            startDate: detail.offerStartDate,
            endDate: detail.offerEndDate,
            status: detail.offerStatus,
            logoUrl: detail.offerLogo
              ? this.fileUploadService.getFileUrl(
                  'offer_logo',
                  detail.offerLogo,
                )
              : null,
            originalPrice,
            offerPrice,
            discountAmount: parseFloat(discountAmount.toFixed(2)),
            discountPercentage,
          }
        : null;

      sessionData.services.push({
        detailId: detail.detailId,
        serviceId: detail.serviceId,
        serviceName: detail.serviceName || 'Servicio no encontrado',
        serviceDescription: detail.serviceDescription || '',
        currency: detail.serviceCurrency ?? null,
        // Tiempo estimado del servicio definido por la compañía (en minutos)
        standardTime:
          detail.serviceStandardTime != null
            ? Number(detail.serviceStandardTime)
            : null,
        cost,
        originalPrice,
        appliedPrice: cost,
        isOffer: hasOffer,
        offer: offerObj,
        // Tiempo planificado del trabajador para este servicio (en minutos)
        durationWorker: totalTime,
        // Tiempo real del servicio (inicio→fin; 0 si no está completado)
        realDuration: realTime,
        totalWorker,
        totalCompany,
        detailStatus: detail.detailStatus || 1,
        detailStatusText: this.getDetailStatusText(detail.detailStatus || 1),
        startDatetime: detail.detailStartDatetime,
        // CLYP-311 (B4): fin por detalle para dibujar el bloque en el calendario.
        endDatetime: detail.detailEndDatetime,
        // Hora agendada original (para "agendada X · movida a Y").
        originalStartDatetime: detail.detailOriginalStartDatetime,
        originalEndDatetime: detail.detailOriginalEndDatetime,
        isExtra: detail.isExtra === true || detail.isExtra === 1,
        isCourtesy: detail.isCourtesy === true || detail.isCourtesy === 1,
        workerPercentage,
        companyPercentage,
        company: companyObj,
        worker: workerObj,
        // Ids planos del trabajador para calificar por la vía segura
        // (POST /workerfeedbacks con companyWorkerId + sessionId).
        companyWorkerId: detail.companyWorkerId ?? null,
        workerId: detail.workerId ?? null,
        description: detail.detailDescription ?? null,
        descriptionIA: detail.detailDescriptionIA ?? null,
        cancelReason: detail.detailCancelReason ?? null,
        cancelledBy: detail.detailCancelledBy ?? null,
        cancelledByText: this.getCancelledByText(detail.detailCancelledBy),
      });

      sessionData.totalCost += cost;
      sessionData.workerEstimateTime += totalTime;
      sessionData.realTotalTime += realTime;
      sessionData.servicesCount += 1;
    }

    // Convertir el mapa a array
    const sessions = Array.from(sessionMap.values()).map((session) => ({
      ...session,
      totalCost: parseFloat(session.totalCost.toFixed(2)),
      workerEstimateTime: parseFloat(session.workerEstimateTime.toFixed(2)),
      realTotalTime: parseFloat(session.realTotalTime.toFixed(2)),
    }));

    // Ordenar nuevamente por si acaso (aunque ya se ordenó en la query)
    if (getSessionsDto.orderBy === 'oldest') {
      sessions.sort(
        (a, b) =>
          new Date(a.sessionDatetime).getTime() -
          new Date(b.sessionDatetime).getTime(),
      );
    } else {
      sessions.sort(
        (a, b) =>
          new Date(b.sessionDatetime).getTime() -
          new Date(a.sessionDatetime).getTime(),
      );
    }

    // B1: estado de calificación por cita (batch, aditivo). El cliente
    // autenticado es el dueño → su userId es el de las reseñas.
    const feedbackMap = await this.feedbacksService.getFeedbackForSessions(
      clientUserId,
      sessions.map((s) => s.id),
    );
    const sessionsWithFeedback = sessions.map((s) => ({
      ...s,
      feedback: feedbackMap.get(s.id) ?? null,
    }));

    // Datos del cliente autenticado (una sola vez, top-level)
    const clientInfo = {
      id: client.id,
      name: client.name,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
      birthDate: client.birthDate,
      location: client.location,
      isActive: client.isActive,
      photoUrl: client.picture
        ? this.fileUploadService.getFileUrl('client_photo', client.picture)
        : null,
    };

    return {
      data: sessionsWithFeedback,
      client: clientInfo,
      meta: {
        page: getSessionsDto.page,
        limit: getSessionsDto.limit,
        total,
        totalPages: Math.ceil(total / getSessionsDto.limit),
        hasNext: getSessionsDto.page < Math.ceil(total / getSessionsDto.limit),
        hasPrev: getSessionsDto.page > 1,
      },
    };
  }

  /**
   * Resuelve el costo del servicio para un trabajador concreto (CLYP-301).
   *
   * Regla: `worker.cost ?? service.cost`.
   * - Si el trabajador elegido tiene un `cost` propio en `service.workers[]`,
   *   se usa ese costo específico.
   * - Si no lo tiene (o no hay trabajador), se usa el `cost` a nivel de
   *   servicio como precio base / fallback.
   *
   * Los decimales pueden venir como string desde la BD, por eso se normaliza
   * todo a número.
   */
  private resolveWorkerServiceCost(
    service: Service,
    companyWorkerId: number | null | undefined,
  ): number {
    const toNumber = (value: unknown): number => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseFloat(value) || 0;
      if (value && typeof value === 'object')
        return parseFloat(String(value)) || 0;
      return 0;
    };

    // Costo base a nivel de servicio (fallback).
    const baseCost = toNumber(service.cost);

    // Buscar la asignación del trabajador elegido dentro del JSON workers.
    const assignment =
      companyWorkerId !== null && companyWorkerId !== undefined
        ? (service.workers || []).find((w) => w.id === companyWorkerId)
        : undefined;

    // Si el trabajador trae su propio cost, usarlo; si no, el del servicio.
    if (
      assignment &&
      assignment.cost !== null &&
      assignment.cost !== undefined
    ) {
      return toNumber(assignment.cost);
    }

    return baseCost;
  }

  /**
   * Resuelve el precio final de un servicio.
   * Si viene offerId → valida y usa el precio de oferta (service_offer.price)
   * Si no viene offerId → retorna isOffer: false para usar service.cost
   */
  private async resolveServicePrice(
    serviceId: number,
    companyId: number,
    offerId?: number,
    referenceDate?: Date,
  ): Promise<{
    finalPrice: number;
    appliedOfferId: number | null;
    isOffer: boolean;
    offerName: string | null;
  }> {
    // Sin offerId → precio normal
    if (!offerId) {
      return {
        finalPrice: 0,
        appliedOfferId: null,
        isOffer: false,
        offerName: null,
      };
    }

    const checkDate = referenceDate ? new Date(referenceDate) : new Date();

    // Buscar el service_offer con su oferta relacionada
    const serviceOffer = await this.serviceOfferRepository
      .createQueryBuilder('so')
      .innerJoinAndSelect('so.offer', 'offer')
      .where('so.serviceId = :serviceId', { serviceId })
      .andWhere('so.offerId = :offerId', { offerId })
      .andWhere('offer.companyId = :companyId', { companyId })
      .andWhere('offer.status = 1')
      .andWhere('offer.startDate <= :checkDate', { checkDate }) // ← CAMBIO
      .andWhere('offer.endDate >= :checkDate', { checkDate }) // ← CAMBIO
      .getOne();

    if (!serviceOffer) {
      throw new BadRequestException(
        `La oferta con ID ${offerId} no es válida para el servicio ${serviceId}. ` +
          `Verifique que la oferta exista, pertenezca a su compañía y esté activa y vigente.`,
      );
    }

    return {
      finalPrice: Number(serviceOffer.price),
      appliedOfferId: offerId,
      isOffer: true,
      offerName: serviceOffer.offer?.name || null,
    };
  }

  /**
   * Eliminar un servicio extra de una sesión
   */
  async removeExtraServiceFromSession(
    sessionId: number,
    detailId: number,
    userId: number,
    userRole: string,
  ): Promise<{ message: string }> {
    // 1. Buscar la sesión
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    // 2. Buscar el detalle extra
    const detail = await this.sessionDetailRepository.findOne({
      where: { id: detailId, sessionId: sessionId, isExtra: true },
    });

    if (!detail) {
      throw new NotFoundException(
        `Servicio extra con ID ${detailId} no encontrado en la sesión ${sessionId}`,
      );
    }

    // 3. Verificar permisos según el rol
    if (userRole === 'adm') {
      const adminCompany = await this.companyRepository.findOne({
        where: { userId: userId },
      });

      if (!adminCompany) {
        throw new NotFoundException(
          'El administrador no tiene una compañía asignada',
        );
      }

      const companyWorker = await this.companyWorkerRepository.findOne({
        where: { id: detail.companyWorkerId },
        relations: ['company'],
      });

      if (companyWorker?.company?.id !== adminCompany.id) {
        throw new ForbiddenException(
          'No tienes permiso para modificar esta sesión',
        );
      }
    } else if (userRole === 'cli') {
      const client = await this.clientRepository.findOne({
        where: { userId },
      });
      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }
      if (session.clientId !== client.id) {
        throw new ForbiddenException(
          'No tienes permiso para modificar esta sesión',
        );
      }
    } else if (userRole === 'wrk') {
      const workerCws = await this.companyWorkerRepository.find({
        where: { userId, isActive: 1 },
        select: ['id'],
      });
      const workerCwIds = new Set(workerCws.map((cw) => cw.id));
      const sessionDetails = await this.sessionDetailRepository.find({
        where: { sessionId },
      });
      const ownsSession = sessionDetails.some(
        (d) => d.companyWorkerId != null && workerCwIds.has(d.companyWorkerId),
      );
      if (!ownsSession) {
        throw new ForbiddenException(
          'No tienes permiso para modificar esta sesión',
        );
      }
    }

    // 5. Restar los totales del detalle de la sesión
    session.totalCost =
      Number(session.totalCost || 0) - Number(detail.cost || 0);
    session.totalTime =
      Number(session.totalTime || 0) - Number(detail.totalTime || 0);

    // 6. Eliminar del JSON extraServices
    if (session.extraServices && Array.isArray(session.extraServices)) {
      session.extraServices = session.extraServices.filter(
        (extra) => extra.sessionDetailId !== detailId,
      );
    }

    await this.sessionRepository.save(session);

    // 7. Eliminar el detalle extra
    await this.sessionDetailRepository
      .createQueryBuilder()
      .delete()
      .where('id = :id AND session_id = :sessionId', {
        id: detailId,
        sessionId: sessionId,
      })
      .execute();

    return {
      message: `Servicio extra eliminado exitosamente de la sesión ${sessionId}`,
    };
  }

  /**
   * Cambia el servicio de un detalle YA AGENDADO de una cita.
   *
   * Reemplaza el `serviceId` del session_detail por otro servicio, MANTENIENDO
   * el mismo trabajador y horario de inicio, y recalculando precio, duración,
   * reparto worker/compañía y los totales de la cita.
   *
   * Reglas:
   * - Solo admin (dueño de la compañía) o el trabajador asignado a ese detalle.
   * - Solo mientras el detalle siga "Agendado" (status 1) y la cita no esté en
   *   estado terminal (Pagada 4 / Cancelada 5 / Calificada 6). Para el rol
   *   worker, además, no se permite si el admin tomó el control (statusLocked).
   * - No aplica a servicios extra (usar los endpoints de extra-services).
   * - El trabajador asignado debe estar habilitado para el nuevo servicio
   *   (service.workers[]), si el servicio restringe trabajadores.
   */
  async changeDetailService(
    sessionId: number,
    detailId: number,
    dto: ChangeDetailServiceDto,
    userId: number,
    userRole?: string,
  ): Promise<{
    message: string;
    detail: SessionDetail;
    previousServiceId: number;
    newServiceId: number;
    newTotals: { totalCost: number; totalTime: number };
    calculation: {
      serviceName: string;
      cost: number;
      totalTime: number;
      totalWorker: number;
      totalCompany: number;
      workerPercentage: number;
      companyPercentage: number;
      isOffer: boolean;
      appliedOfferId: number | null;
      offerName: string | null;
    };
    // Citas AGENDADAS del mismo trabajador que el arrastre (ripple) corrió de
    // hora al aplicar la nueva duración. El controller notifica a los afectados.
    movedByRipple: RippleMovedDetail[];
    // Trabajador del detalle (para notificar el arrastre a worker + admin).
    companyWorkerId: number;
  }> {
    // 1. Sesión y detalle
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`Sesión con ID ${sessionId} no encontrada`);
    }

    const detail = await this.sessionDetailRepository.findOne({
      where: { id: detailId, sessionId },
    });
    if (!detail) {
      throw new NotFoundException(
        `Detalle ${detailId} no encontrado en la sesión ${sessionId}`,
      );
    }

    if (detail.isExtra) {
      throw new BadRequestException(
        'No se puede cambiar el servicio de un servicio extra. Elimínalo y vuelve a agregarlo con los endpoints de servicios extra.',
      );
    }

    if (detail.companyWorkerId == null) {
      throw new BadRequestException(
        'El detalle no tiene trabajador asignado. Asigna un trabajador antes de cambiar el servicio.',
      );
    }

    // 2. Estados: la cita no puede estar en un estado terminal y el detalle
    //    debe seguir "Agendado". Para el worker, respetar statusLocked.
    if (
      session.sessionStatus === 4 ||
      session.sessionStatus === 5 ||
      session.sessionStatus === 6
    ) {
      throw new BadRequestException(
        `La cita está en estado "${this.getSessionStatusText(session.sessionStatus)}" y no admite cambios en sus servicios`,
      );
    }
    if (detail.status !== 1) {
      throw new BadRequestException(
        `Solo se puede cambiar el servicio mientras el detalle esté "Agendado"; el actual está "${this.getDetailStatusText(detail.status)}"`,
      );
    }
    if (userRole === 'wrk' && session.statusLocked) {
      throw new BadRequestException(
        'La cita está bajo control del administrador; no puedes cambiar el servicio.',
      );
    }

    // 3. Permisos + compañía a la que pertenece el detalle
    let companyId: number;
    if (userRole === 'adm') {
      const adminCompany = await this.companyRepository.findOne({
        where: { userId },
      });
      if (!adminCompany) {
        throw new NotFoundException(
          'El administrador no tiene una compañía asignada',
        );
      }
      const cw = await this.companyWorkerRepository.findOne({
        where: { id: detail.companyWorkerId },
        relations: ['company'],
      });
      if (!cw || cw.company?.id !== adminCompany.id) {
        throw new ForbiddenException(
          'No tienes permiso para modificar este detalle',
        );
      }
      companyId = adminCompany.id;
    } else if (userRole === 'wrk') {
      const worker = await this.workerRepository.findOne({
        where: { userId },
      });
      if (!worker) {
        throw new NotFoundException('Trabajador no encontrado');
      }
      const cw = await this.companyWorkerRepository.findOne({
        where: { id: detail.companyWorkerId, workerId: worker.id },
        relations: ['company'],
      });
      if (!cw) {
        throw new ForbiddenException(
          'No tienes permiso para modificar este detalle',
        );
      }
      if (cw.isActive !== 1) {
        throw new BadRequestException('No estás activo en esta compañía');
      }
      companyId = cw.company?.id;
      if (!companyId) {
        throw new NotFoundException(
          'El trabajador no tiene una compañía asignada',
        );
      }
    } else {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta acción',
      );
    }

    // 4. No tiene sentido "cambiar" al mismo servicio
    if (dto.serviceId === detail.serviceId) {
      throw new BadRequestException(
        'El detalle ya usa ese servicio. Elige un servicio distinto.',
      );
    }

    // 5. Nuevo servicio: debe existir y pertenecer a la misma compañía
    const service = await this.serviceRepository.findOne({
      where: { id: dto.serviceId, companyId },
    });
    if (!service) {
      throw new NotFoundException(
        `Servicio con ID ${dto.serviceId} no encontrado o no pertenece a tu compañía`,
      );
    }
    this.validateServicePercentagesAndTime(service);

    // Nombre del trabajador asignado (para mensajes de error).
    const detailWorker = await this.companyWorkerRepository.findOne({
      where: { id: detail.companyWorkerId },
      relations: ['worker'],
    });
    const detailWorkerName =
      detailWorker?.worker && (detailWorker.worker.name || '').trim()
        ? (detailWorker.worker.name || '').trim()
        : `Trabajador #${detail.companyWorkerId}`;

    // 6. El trabajador asignado debe estar habilitado para el nuevo servicio,
    //    si el servicio restringe la lista de trabajadores (service.workers[]).
    if (Array.isArray(service.workers) && service.workers.length > 0) {
      const isAllowed = service.workers.some(
        (w: any) => w.id === detail.companyWorkerId,
      );
      if (!isAllowed) {
        const allowedIds = service.workers.map((w: any) => w.id);
        const allowedWorkers = await this.companyWorkerRepository.find({
          where: { id: In(allowedIds) },
          relations: ['worker'],
        });
        const allowedNames = allowedWorkers
          .map((cw) =>
            cw.worker
              ? (cw.worker.name || '').trim() || `Trabajador #${cw.id}`
              : `Trabajador #${cw.id}`,
          )
          .filter((n) => n.length > 0);
        const allowedText =
          allowedNames.length > 0
            ? allowedNames.join(', ')
            : 'ninguno configurado';
        throw new BadRequestException(
          `${detailWorkerName} no puede realizar el servicio ${service.name}. Trabajadores habilitados: ${allowedText}.`,
        );
      }
    }

    // 7. Evitar que el mismo trabajador quede con el mismo servicio dos veces
    //    en la misma cita.
    const duplicate = await this.sessionDetailRepository.findOne({
      where: {
        sessionId,
        serviceId: dto.serviceId,
        companyWorkerId: detail.companyWorkerId,
      },
    });
    if (duplicate && duplicate.id !== detail.id) {
      throw new BadRequestException(
        `${detailWorkerName} ya tiene el servicio "${service.name}" en esta cita`,
      );
    }

    // 8. Recalcular precio (oferta o worker.cost ?? service.cost), reparto y
    //    duración a partir del nuevo servicio.
    const priceResolution = await this.resolveServicePrice(
      dto.serviceId,
      companyId,
      dto.offerId,
      detail.startDatetime,
    );
    const finalPrice = priceResolution.isOffer
      ? priceResolution.finalPrice
      : this.resolveWorkerServiceCost(service, detail.companyWorkerId);
    if (finalPrice <= 0) {
      throw new BadRequestException(
        `El costo del servicio "${service.name}" debe ser mayor a 0`,
      );
    }

    const {
      workerPercentage,
      companyPercentage,
      time: newTime,
    } = this.calculatePercentagesAndTime(service, detail.companyWorkerId);
    const amounts = this.calculateAmounts(
      finalPrice,
      workerPercentage,
      companyPercentage,
    );

    // 9. Recalcular fin del bloque según la nueva duración.
    const start = detail.startDatetime ? new Date(detail.startDatetime) : null;
    const newEnd =
      start && newTime > 0 ? new Date(start.getTime() + newTime * 60000) : null;

    const previousServiceId = detail.serviceId;

    // 10. Persistir el cambio del detalle. `service_id` es parte de la PK
    //     compuesta, así que se actualiza con un UPDATE directo por
    //     `id + session_id` (se conserva el mismo id del detalle, del que
    //     dependen el front y las notificaciones).
    await this.sessionRepository.manager.transaction(async (manager) => {
      const sdRepo = manager.getRepository(SessionDetail);

      const setFields: Partial<SessionDetail> = {
        serviceId: dto.serviceId,
        cost: amounts.cost,
        totalWorker: amounts.totalWorker,
        totalCompany: amounts.totalCompany,
        totalTime: newTime,
        // La columna admite NULL en BD aunque el tipo TS sea number; limpiar la
        // oferta previa cuando el nuevo precio no proviene de una oferta.
        offerId: (priceResolution.appliedOfferId ?? null) as unknown as number,
      };
      if (newEnd) {
        setFields.endDatetime = newEnd;
        setFields.originalEndDatetime = newEnd;
      }

      await sdRepo
        .createQueryBuilder()
        .update(SessionDetail)
        .set(setFields)
        .where('id = :id AND session_id = :sessionId', {
          id: detailId,
          sessionId,
        })
        .execute();
    });

    // 11. Arrastre (ripple): si la nueva duración pisa las citas AGENDADAS
    //     siguientes del mismo trabajador, se corren hacia abajo (no se
    //     rechaza), protegiendo el detalle recién cambiado. Best-effort: si el
    //     arrastre falla, el cambio de servicio ya quedó guardado.
    let movedByRipple: RippleMovedDetail[] = [];
    if (start) {
      movedByRipple = await this.rippleWorkerColumn(
        detail.companyWorkerId,
        start,
        [detailId],
      );
    }

    // 12. Recalcular los totales de la cita DESPUÉS del arrastre (por si un
    //     servicio hermano de esta misma cita se movió de hora).
    const afterDetails = await this.sessionDetailRepository.find({
      where: { sessionId },
    });
    const active = afterDetails.filter((d) => d.status !== 5);
    const newTotalCost = active.reduce(
      (sum, d) => sum + Number(d.cost || 0),
      0,
    );
    const newTotalTime = this.calculateRealTotalTime(
      active
        .filter((d) => d.startDatetime && d.totalTime)
        .map((d) => ({
          startDatetime: d.startDatetime,
          totalTime: d.totalTime || 0,
        })),
    );
    await this.sessionRepository.update(
      { id: sessionId },
      { totalCost: newTotalCost, totalTime: newTotalTime },
    );

    // 13. Releer el detalle y la cita ya actualizados
    const updatedDetail = await this.sessionDetailRepository.findOne({
      where: { id: detailId, sessionId },
    });
    const updatedSession = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    return {
      message: `Servicio del detalle ${detailId} cambiado a "${service.name}" exitosamente`,
      detail: updatedDetail as SessionDetail,
      previousServiceId,
      newServiceId: dto.serviceId,
      newTotals: {
        totalCost: Number(updatedSession?.totalCost ?? 0),
        totalTime: Number(updatedSession?.totalTime ?? 0),
      },
      calculation: {
        serviceName: service.name || '',
        cost: amounts.cost,
        totalTime: newTime,
        totalWorker: amounts.totalWorker,
        totalCompany: amounts.totalCompany,
        workerPercentage,
        companyPercentage,
        isOffer: priceResolution.isOffer,
        appliedOfferId: priceResolution.appliedOfferId,
        offerName: priceResolution.offerName,
      },
      movedByRipple,
      companyWorkerId: detail.companyWorkerId,
    };
  }

  // =========================================================================
  // ENDPOINTS PARA EL WORKER AUTENTICADO
  // =========================================================================

  /**
   * Helper: resuelve los company_worker ids activos del worker indicado.
   * Si se pasa `workerId` (admin inspeccionando), se resuelve por ese id.
   * Si no, se resuelve por el `userId` autenticado (worker viendo lo suyo).
   */
  private async resolveWorkerCompanyWorkerIds(
    userId: number,
    targetWorkerId?: number,
  ): Promise<{
    worker: Worker;
    companyWorkerIds: number[];
    companyIds: number[];
  }> {
    const worker = targetWorkerId
      ? await this.workerRepository.findOne({ where: { id: targetWorkerId } })
      : await this.workerRepository.findOne({ where: { userId } });

    if (!worker) {
      throw new NotFoundException('Trabajador no encontrado');
    }

    const companyWorkers = await this.companyWorkerRepository.find({
      where: { workerId: worker.id, isActive: 1 },
    });

    if (companyWorkers.length === 0) {
      throw new NotFoundException(
        targetWorkerId
          ? `El trabajador ${targetWorkerId} no tiene asignaciones activas en ninguna compañía`
          : 'No tienes asignaciones activas en ninguna compañía',
      );
    }

    return {
      worker,
      companyWorkerIds: companyWorkers.map((cw) => cw.id),
      companyIds: [...new Set(companyWorkers.map((cw) => cw.companyId))],
    };
  }

  /**
   * GET /sessions/worker/my-services
   * Lista paginada de servicios donde el worker está asignado, leída del catálogo
   * `service.workers` JSON (fuente de verdad). Adicionalmente cruza con
   * session_detail para incluir contadores históricos (citas, completadas,
   * canceladas, ingresos, tiempo).
   */
  async getWorkerAssignedServices(
    userId: number,
    page: number = 1,
    limit: number = 10,
    targetWorkerId?: number,
  ): Promise<
    PaginationResult<{
      serviceId: number;
      serviceName: string;
      serviceDescription: string | null;
      cost: number;
      currency: string | null;
      standardTime: number | null;
      categoryId: number | null;
      categoryName: string | null;
      workerPercentage: number;
      workerTime: number | null;
      totalAppointments: number;
      totalCompleted: number;
      totalCancelled: number;
      totalEarned: number;
      totalTime: number;
      // Cortesías completadas de este servicio (no suman a los contadores de
      // arriba ni al dinero; se muestran como "Cortesías: N").
      courtesyCount: number;
    }>
  > {
    const { companyWorkerIds } = await this.resolveWorkerCompanyWorkerIds(
      userId,
      targetWorkerId,
    );

    // 1) Catálogo: servicios donde service.workers contiene alguno de los
    //    company_worker.id del trabajador (service.workers[].id == company_worker.id).
    const catalogQuery = this.serviceRepository
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.category', 'category')
      .where(
        new Brackets((qb) => {
          companyWorkerIds.forEach((cwId, idx) => {
            const param = `cwId${idx}`;
            const condition = `JSON_CONTAINS(JSON_EXTRACT(service.workers, '$[*].id'), CAST(:${param} AS JSON))`;
            if (idx === 0) {
              qb.where(condition, { [param]: cwId });
            } else {
              qb.orWhere(condition, { [param]: cwId });
            }
          });
        }),
      )
      .orderBy('service.id', 'DESC');

    const total = await catalogQuery.getCount();

    const emptyMeta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    };

    if (total === 0) {
      return { data: [], meta: emptyMeta };
    }

    const services = await catalogQuery
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    if (services.length === 0) {
      return { data: [], meta: emptyMeta };
    }

    const serviceIds = services.map((s) => s.id);

    // 2) Contadores históricos desde session_detail (solo para los servicios del catálogo)
    const aggregates = await this.sessionDetailRepository
      .createQueryBuilder('detail')
      .select('detail.service_id', 'serviceId')
      // Los contadores de "servicios que suman dinero" excluyen cortesías;
      // estas se llevan aparte en courtesyCount.
      .addSelect(
        'SUM(CASE WHEN detail.is_courtesy = 0 THEN 1 ELSE 0 END)',
        'totalAppointments',
      )
      .addSelect(
        'SUM(CASE WHEN detail.status IN (3, 4) AND detail.is_courtesy = 0 THEN 1 ELSE 0 END)',
        'totalCompleted',
      )
      .addSelect(
        'SUM(CASE WHEN detail.status = 5 AND detail.is_courtesy = 0 THEN 1 ELSE 0 END)',
        'totalCancelled',
      )
      .addSelect(
        'SUM(CASE WHEN detail.status IN (3, 4) AND detail.is_courtesy = 0 THEN detail.total_worker ELSE 0 END)',
        'totalEarned',
      )
      // Cortesías completadas (status 3/4) de este servicio.
      .addSelect(
        'SUM(CASE WHEN detail.status IN (3, 4) AND detail.is_courtesy = 1 THEN 1 ELSE 0 END)',
        'courtesyCount',
      )
      //  Calcular tiempo REAL trabajado (minutos, con decimales) a partir de
      //  start_datetime y end_datetime. Se usa SECOND/60 para conservar la
      //  fracción de minuto que TIMESTAMPDIFF(MINUTE, ...) descartaría.
      .addSelect(
        `
    SUM(
      CASE
        WHEN detail.status IN (3, 4)
             AND detail.is_courtesy = 0
             AND detail.start_datetime IS NOT NULL
             AND detail.end_datetime IS NOT NULL
        THEN TIMESTAMPDIFF(SECOND, detail.start_datetime, detail.end_datetime) / 60
        ELSE 0
      END
    )`,
        'totalTime',
      )
      .where('detail.company_worker_id IN (:...companyWorkerIds)', {
        companyWorkerIds,
      })
      .andWhere('detail.service_id IN (:...serviceIds)', { serviceIds })
      .groupBy('detail.service_id')
      .getRawMany();

    const aggMap = new Map<number, any>();
    for (const a of aggregates) {
      aggMap.set(Number(a.serviceId), a);
    }

    const data = services.map((s) => {
      const a = aggMap.get(s.id);
      const workerEntry = Array.isArray(s.workers)
        ? s.workers.find((w: any) => companyWorkerIds.includes(Number(w?.id)))
        : null;

      return {
        serviceId: s.id,
        serviceName: s.name,
        serviceDescription: s.description ?? null,
        cost: Number(s.cost ?? 0) || 0,
        currency: s.currency ?? null,
        standardTime: s.standardTime ?? null,
        categoryId: s.categoryId ?? null,
        categoryName: s.category?.name ?? null,
        workerPercentage: Number(workerEntry?.percentage ?? 0) || 0,
        workerTime: workerEntry?.time ?? null,
        totalAppointments: parseInt(a?.totalAppointments, 10) || 0,
        totalCompleted: parseInt(a?.totalCompleted, 10) || 0,
        totalCancelled: parseInt(a?.totalCancelled, 10) || 0,
        totalEarned:
          parseFloat(parseFloat(a?.totalEarned || '0').toFixed(2)) || 0,
        totalTime: parseFloat(parseFloat(a?.totalTime || '0').toFixed(2)) || 0,
        courtesyCount: parseInt(a?.courtesyCount, 10) || 0,
      };
    });

    return { data, meta: emptyMeta };
  }

  /**
   * GET /sessions/worker/my-clients
   * Lista paginada de clientes distintos atendidos por el worker autenticado.
   */
  async getWorkerClients(
    userId: number,
    page: number = 1,
    limit: number = 10,
    targetWorkerId?: number,
  ): Promise<PaginationResult<any>> {
    const { companyWorkerIds, companyIds } =
      await this.resolveWorkerCompanyWorkerIds(userId, targetWorkerId);

    const apptRows = await this.sessionDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('session', 'session', 'session.id = detail.session_id')
      .select('session.client_id', 'clientId')
      .addSelect('COUNT(DISTINCT session.id)', 'totalAppointments')
      .addSelect('MAX(session.session_datetime)', 'lastAppointmentDate')
      .where('detail.company_worker_id IN (:...companyWorkerIds)', {
        companyWorkerIds,
      })
      .andWhere('session.client_id IS NOT NULL')
      .groupBy('session.client_id')
      .getRawMany();

    const apptByClient = new Map<
      number,
      { totalAppointments: number; lastAppointmentDate: Date | null }
    >();
    for (const r of apptRows) {
      apptByClient.set(Number(r.clientId), {
        totalAppointments: parseInt(r.totalAppointments, 10) || 0,
        lastAppointmentDate: r.lastAppointmentDate ?? null,
      });
    }

    const createdClients = companyWorkerIds.length
      ? await this.clientRepository.find({
          where: { createdByCompanyWorkerId: In(companyWorkerIds) },
          select: ['id'],
        })
      : [];

    const allIds = Array.from(
      new Set<number>([
        ...apptByClient.keys(),
        ...createdClients.map((c) => c.id),
      ]),
    );
    const total = allIds.length;
    const totalPages = Math.ceil(total / limit);

    allIds.sort((a, b) => {
      const da = apptByClient.get(a)?.lastAppointmentDate;
      const db = apptByClient.get(b)?.lastAppointmentDate;
      const ta = da ? new Date(da).getTime() : 0;
      const tb = db ? new Date(db).getTime() : 0;
      return tb - ta;
    });

    const pageIds = allIds.slice((page - 1) * limit, page * limit);

    if (pageIds.length === 0) {
      return {
        data: [],
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

    const workerCompanyId = companyIds[0] ?? null;
    const clients = await this.clientRepository.find({
      where: { id: In(pageIds) },
      select: [
        'id',
        'name',
        'lastName',
        'phone',
        'email',
        'picture',
        'companyAliases',
      ],
    });
    const clientById = new Map<number, Client>(clients.map((c) => [c.id, c]));

    const data = pageIds
      .map((id) => clientById.get(id))
      .filter((c): c is Client => !!c)
      .map((c) => {
        const appt = apptByClient.get(c.id);
        const aliasEntry =
          workerCompanyId !== null
            ? (c.companyAliases ?? []).find(
                (a) => Number(a.companyId) === workerCompanyId,
              )
            : undefined;
        const alias = aliasEntry?.alias ?? null;
        return {
          id: c.id,
          name: c.name,
          lastName: c.lastName,
          phone: c.phone,
          email: c.email,
          alias,
          displayName: alias
            ? alias
            : `${c.name || ''} ${c.lastName || ''}`.trim(),
          photoUrl: c.picture
            ? this.fileUploadService.getFileUrl('client_photo', c.picture)
            : null,
          totalAppointments: appt?.totalAppointments ?? 0,
          lastAppointmentDate: appt?.lastAppointmentDate ?? null,
        };
      });

    return {
      data,
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

  /**
   * GET /sessions/worker/my-history
   * Historial paginado de citas en estados terminales del worker.
   *
   * Estados válidos del historial: Completada(3), Pagado(4), Cancelada(5), Calificada(6).
   * Acepta filtros opcionales por estado:
   *  - `detailStatus`: filtra por estado del DETALLE. Si no se pasa → [3,4,5,6].
   *  - `sessionStatus`: filtra por estado de la SESIÓN (cita). Si no se pasa → sin filtro de sesión.
   * Si se pasan valores fuera de [3,4,5,6] se lanza BadRequestException.
   */
  async getWorkerHistory(
    userId: number,
    getSessionsDto: GetSessionsDto,
    targetWorkerId?: number,
  ): Promise<PaginationResult<any>> {
    // Estados terminales permitidos en el historial
    const HISTORY_STATUSES = [3, 4, 5, 6];

    // Validar detailStatus recibido (si lo hay)
    if (getSessionsDto.detailStatus && getSessionsDto.detailStatus.length > 0) {
      const invalid = getSessionsDto.detailStatus.filter(
        (s) => !HISTORY_STATUSES.includes(s),
      );
      if (invalid.length > 0) {
        throw new BadRequestException(
          `detailStatus inválido: ${invalid.join(', ')}. El historial sólo admite 3 (Completado), 4 (Pagado), 5 (Cancelado) o 6 (Calificada).`,
        );
      }
    }

    // Validar sessionStatus recibido (si lo hay)
    if (
      getSessionsDto.sessionStatus &&
      getSessionsDto.sessionStatus.length > 0
    ) {
      const invalid = getSessionsDto.sessionStatus.filter(
        (s) => !HISTORY_STATUSES.includes(s),
      );
      if (invalid.length > 0) {
        throw new BadRequestException(
          `sessionStatus inválido: ${invalid.join(', ')}. El historial sólo admite 3 (Completada), 4 (Pagada), 5 (Cancelada) o 6 (Calificada).`,
        );
      }
    }

    // detailStatus: lo recibido o, por defecto, todos los terminales
    const detailStatus =
      getSessionsDto.detailStatus && getSessionsDto.detailStatus.length > 0
        ? getSessionsDto.detailStatus
        : HISTORY_STATUSES;

    // sessionStatus: sólo si el caller lo envió (sino, sin filtro a nivel sesión)
    const sessionStatus =
      getSessionsDto.sessionStatus && getSessionsDto.sessionStatus.length > 0
        ? getSessionsDto.sessionStatus
        : undefined;

    const filteredDto: GetSessionsDto = {
      ...getSessionsDto,
      detailStatus,
      sessionStatus,
      // `onlyScheduled` forzaría detail.status=1 y anularía el historial
      onlyScheduled: false,
    };

    // Si admin pasa workerId, resolvemos el userId de ese worker para reutilizar
    // getSessionsForAuthenticatedWorker sin duplicar lógica.
    if (targetWorkerId) {
      const worker = await this.workerRepository.findOne({
        where: { id: targetWorkerId },
      });
      if (!worker) {
        throw new NotFoundException('Trabajador no encontrado');
      }
      return this.getSessionsForAuthenticatedWorker(worker.userId, filteredDto);
    }
    return this.getSessionsForAuthenticatedWorker(userId, filteredDto);
  }

  /**
   * GET /sessions/worker/income-report
   * Reporte de ingresos por servicio del worker autenticado (suma total_worker
   * de detalles con status completado/pagado). Opcionalmente filtrable por rango.
   */
  async getWorkerIncomeReport(
    userId: number,
    startDate?: string,
    endDate?: string,
    targetWorkerId?: number,
  ): Promise<{
    range: { startDate: string | null; endDate: string | null };
    totals: {
      totalEarned: number;
      totalSessions: number;
      totalServices: number;
      totalTime: number;
      // Cortesías del rango (status 3/4), separadas de lo pagado: no suman a
      // totalEarned. El front las suma a los pagados solo para mostrar.
      courtesySessions: number;
      courtesyServices: number;
      courtesyTime: number;
    };
    byService: Array<{
      serviceId: number;
      serviceName: string;
      sessionsCount: number;
      totalEarned: number;
      totalTime: number;
      averagePerSession: number;
    }>;
  }> {
    const { companyWorkerIds } = await this.resolveWorkerCompanyWorkerIds(
      userId,
      targetWorkerId,
    );

    const query = this.sessionDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('session', 'session', 'session.id = detail.session_id')
      .leftJoin('service', 'service', 'service.id = detail.service_id')
      .select('detail.service_id', 'serviceId')
      .addSelect('service.name', 'serviceName')
      .addSelect('COUNT(detail.id)', 'sessionsCount')
      .addSelect('SUM(detail.total_worker)', 'totalEarned')
      // Tiempo REAL trabajado (minutos con decimales) desde start/end_datetime.
      .addSelect(
        `
    SUM(
      CASE
        WHEN detail.start_datetime IS NOT NULL
             AND detail.end_datetime IS NOT NULL
        THEN TIMESTAMPDIFF(SECOND, detail.start_datetime, detail.end_datetime) / 60
        ELSE 0
      END
    )`,
        'totalTime',
      )
      .where('detail.company_worker_id IN (:...companyWorkerIds)', {
        companyWorkerIds,
      })
      .andWhere('detail.status IN (:...completedStatus)', {
        completedStatus: [3, 4],
      })
      // Las cortesías no cuentan como ingreso ni servicio del worker.
      .andWhere('detail.is_courtesy = 0');

    // Normalizar el rango al inicio/fin del día EN LA ZONA DEL NEGOCIO, para que
    // sea inclusivo del día completo y no pierda las citas de noche.
    const toStartOfDay = (d: string): Date => businessDayBounds(d).startOfDay;
    const toEndOfDay = (d: string): Date => businessDayBounds(d).endOfDay;

    // Mismo filtro de rango para la query de ingresos y la de cortesías.
    const applyRange = (qb: typeof query) => {
      if (startDate && endDate) {
        qb.andWhere(
          'session.session_datetime BETWEEN :startDate AND :endDate',
          {
            startDate: toStartOfDay(startDate),
            endDate: toEndOfDay(endDate),
          },
        );
      } else if (startDate) {
        qb.andWhere('session.session_datetime >= :startDate', {
          startDate: toStartOfDay(startDate),
        });
      } else if (endDate) {
        qb.andWhere('session.session_datetime <= :endDate', {
          endDate: toEndOfDay(endDate),
        });
      }
    };
    applyRange(query);

    const rows = await query
      .groupBy('detail.service_id')
      .addGroupBy('service.name')
      .orderBy('totalEarned', 'DESC')
      .getRawMany();

    const byService = rows.map((r) => {
      const sessionsCount = parseInt(r.sessionsCount, 10) || 0;
      const totalEarned =
        parseFloat(parseFloat(r.totalEarned || '0').toFixed(2)) || 0;
      return {
        serviceId: Number(r.serviceId),
        serviceName: r.serviceName ?? 'Servicio no encontrado',
        sessionsCount,
        totalEarned,
        totalTime: parseFloat(parseFloat(r.totalTime || '0').toFixed(2)) || 0,
        averagePerSession:
          sessionsCount > 0
            ? parseFloat((totalEarned / sessionsCount).toFixed(2))
            : 0,
      };
    });

    const courtesyQuery = this.sessionDetailRepository
      .createQueryBuilder('detail')
      .innerJoin('session', 'session', 'session.id = detail.session_id')
      .select('COUNT(detail.id)', 'courtesySessions')
      .addSelect('COUNT(DISTINCT detail.service_id)', 'courtesyServices')
      .addSelect(
        `
    SUM(
      CASE
        WHEN detail.start_datetime IS NOT NULL
             AND detail.end_datetime IS NOT NULL
        THEN TIMESTAMPDIFF(SECOND, detail.start_datetime, detail.end_datetime) / 60
        ELSE 0
      END
    )`,
        'courtesyTime',
      )
      .where('detail.company_worker_id IN (:...companyWorkerIds)', {
        companyWorkerIds,
      })
      .andWhere('detail.status IN (:...completedStatus)', {
        completedStatus: [3, 4],
      })
      .andWhere('detail.is_courtesy = 1');
    applyRange(courtesyQuery);
    const courtesyRow = await courtesyQuery.getRawOne();

    const courtesySessions = parseInt(courtesyRow?.courtesySessions, 10) || 0;
    const courtesyServices = parseInt(courtesyRow?.courtesyServices, 10) || 0;
    const courtesyTime =
      parseFloat(parseFloat(courtesyRow?.courtesyTime || '0').toFixed(2)) || 0;

    const totals = byService.reduce(
      (acc, s) => {
        acc.totalEarned += s.totalEarned;
        acc.totalSessions += s.sessionsCount;
        acc.totalTime += s.totalTime;
        return acc;
      },
      {
        totalEarned: 0,
        totalSessions: 0,
        totalServices: byService.length,
        totalTime: 0,
        courtesySessions,
        courtesyServices,
        courtesyTime,
      },
    );

    totals.totalEarned = parseFloat(totals.totalEarned.toFixed(2));
    totals.totalTime = parseFloat(totals.totalTime.toFixed(2));

    return {
      range: { startDate: startDate ?? null, endDate: endDate ?? null },
      totals,
      byService,
    };
  }
}
