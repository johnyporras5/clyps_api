import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { Service } from '../service/entities/service.entity';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Client } from '../client/entities/client.entity';
import { Session } from '../session/entities/session.entity';
import {
  FileUploadService,
  AllowedFolder,
} from '../common/services/file_upload.service';
import {
  ACTIVE_WINDOW_DAYS,
  CHURN_WINDOW_DAYS,
  Bucket,
  Granularity,
  ReportPeriod,
  generateBucketPeriods,
  generateGranularityPeriods,
  formatISODate,
} from './utils/clients-report.util';

/** Actividad de citas de un cliente con la compañía, ya normalizada. */
interface ClientActivity {
  client: Client;
  /** Timestamps (ms) de las citas no canceladas, orden ascendente. */
  appointments: number[];
  /** Timestamp (ms) de la primera cita con esta compañía, o null. */
  firstAppointmentMs: number | null;
  /** Timestamp (ms) de registro del usuario (user.created_at), o null. */
  registeredMs: number | null;
}

/** Filas crudas (getRawMany) de los reportes; los agregados llegan como string. */
interface IncomeAggRawRow {
  totalIncome: string | null;
  servicesCount: string;
}
interface ServiceIncomeRawRow extends IncomeAggRawRow {
  serviceId: string;
}
interface WorkerIncomeRawRow extends IncomeAggRawRow {
  companyWorkerId: string;
}
interface ClientApptRawRow {
  sessionId: string;
  clientId: string;
  startDatetime: string | Date | null;
  sessionDatetime: string | Date | null;
}

@Injectable()
export class ReportsService {
  private readonly WORKER_PHOTO_FOLDER: AllowedFolder = 'worker_photo';
  private readonly CLIENT_PHOTO_FOLDER: AllowedFolder = 'client_photo';
  private readonly ACTIVE_WINDOW_MS = ACTIVE_WINDOW_DAYS * 86_400_000;
  private readonly CHURN_WINDOW_MS = CHURN_WINDOW_DAYS * 86_400_000;
  // Estado de session que NO cuenta como cita (5 = Cancelada).
  private readonly CANCELLED_SESSION_STATUS = 5;

  constructor(
    @InjectRepository(SessionDetail)
    private sessionDetailRepository: Repository<SessionDetail>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @Inject(FileUploadService)
    private fileUploadService: FileUploadService,
  ) {}

  async getIncomeByServices(
    adminId: number,
    startDate: string,
    endDate: string,
    page: number = 1,
    limit: number = 10,
  ) {
    // 1. Verificar que el admin tenga compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    // 2. Obtener los servicios de la compañía
    const services = await this.serviceRepository.find({
      where: { companyId: company.id },
    });

    const serviceIds = services.map((s) => s.id);

    if (serviceIds.length === 0) {
      return {
        summary: {
          totalIncome: 0,
          totalServices: 0,
          currency: services[0]?.currency || 'USD',
        },
        services: [],
        meta: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    // 3. Consultar ingresos agrupados por servicio (todos para calcular summary)
    const allResults = await this.sessionDetailRepository
      .createQueryBuilder('sd')
      .select('sd.service_id', 'serviceId')
      .addSelect('SUM(sd.cost)', 'totalIncome')
      .addSelect('COUNT(*)', 'servicesCount')
      .where('sd.service_id IN (:...serviceIds)', { serviceIds })
      .andWhere('sd.start_datetime BETWEEN :startDate AND :endDate', {
        startDate: `${startDate} 00:00:00`,
        endDate: `${endDate} 23:59:59`,
      })
      .andWhere('sd.status = :paid', { paid: 4 })
      // Las cortesías no cuentan como ingreso ni servicio pagado.
      .andWhere('sd.is_courtesy = 0')
      .groupBy('sd.service_id')
      .orderBy('totalIncome', 'DESC')
      .getRawMany<ServiceIncomeRawRow>();

    const courtesyRows = await this.sessionDetailRepository
      .createQueryBuilder('sd')
      .select('sd.service_id', 'serviceId')
      .addSelect('COUNT(*)', 'courtesyServices')
      .where('sd.service_id IN (:...serviceIds)', { serviceIds })
      .andWhere('sd.start_datetime BETWEEN :startDate AND :endDate', {
        startDate: `${startDate} 00:00:00`,
        endDate: `${endDate} 23:59:59`,
      })
      .andWhere('sd.status IN (:...completed)', { completed: [3, 4] })
      .andWhere('sd.is_courtesy = 1')
      .groupBy('sd.service_id')
      .getRawMany<{ serviceId: string; courtesyServices: string }>();

    const courtesyByService = new Map<number, number>();
    let courtesyServices = 0;
    for (const r of courtesyRows) {
      const n = parseInt(r.courtesyServices || '0', 10) || 0;
      courtesyByService.set(parseInt(r.serviceId), n);
      courtesyServices += n;
    }

    // 4. Calcular totales generales (solo ingreso pagado)
    const totalIncome = allResults.reduce(
      (sum, r) => sum + parseFloat(r.totalIncome || '0'),
      0,
    );
    const totalServices = allResults.reduce(
      (sum, r) => sum + parseInt(r.servicesCount || '0'),
      0,
    );

    const incomeByService = new Map<
      number,
      { totalIncome: number; servicesCount: number }
    >();
    for (const r of allResults) {
      incomeByService.set(parseInt(r.serviceId), {
        totalIncome: parseFloat(r.totalIncome || '0'),
        servicesCount: parseInt(r.servicesCount || '0', 10) || 0,
      });
    }

    const combined = [
      ...new Set([...incomeByService.keys(), ...courtesyByService.keys()]),
    ]
      .map((serviceId) => ({
        serviceId,
        totalIncome: incomeByService.get(serviceId)?.totalIncome ?? 0,
        servicesCount: incomeByService.get(serviceId)?.servicesCount ?? 0,
        courtesyServices: courtesyByService.get(serviceId) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.totalIncome - a.totalIncome ||
          b.courtesyServices - a.courtesyServices ||
          a.serviceId - b.serviceId,
      );

    // 6. Paginar resultados
    const total = combined.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedResults = combined.slice(skip, skip + limit);

    // 7. Mapear servicios con nombre y porcentaje
    const serviceMap = new Map(services.map((s) => [s.id, s]));

    const servicesResponse = paginatedResults.map((r) => {
      const service = serviceMap.get(r.serviceId);
      const income = r.totalIncome;
      return {
        serviceId: r.serviceId,
        serviceName: service?.name || 'Servicio eliminado',
        totalIncome: parseFloat(income.toFixed(2)),
        servicesCount: r.servicesCount,
        // Veces dado como cortesía en el rango (aparte de servicesCount).
        courtesyServices: r.courtesyServices,
        percentage:
          totalIncome > 0
            ? parseFloat(((income / totalIncome) * 100).toFixed(2))
            : 0,
        currency: service?.currency || services[0]?.currency || 'USD',
      };
    });

    return {
      summary: {
        totalIncome: parseFloat(totalIncome.toFixed(2)),
        totalServices,
        currency: services[0]?.currency || 'USD',
        // Cortesías del rango, aparte del ingreso (front las nota, no las suma).
        courtesyServices,
      },
      services: servicesResponse,
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

  async getIncomeByEmployees(
    adminId: number,
    startDate: string,
    endDate: string,
    page: number = 1,
    limit: number = 10,
  ) {
    // 1. Verificar que el admin tenga compañía
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    // 2. Obtener los workers de la compañía
    const companyWorkers = await this.companyWorkerRepository.find({
      where: { companyId: company.id },
      relations: ['worker'],
    });

    const workerIds = companyWorkers.map((cw) => cw.id);

    if (workerIds.length === 0) {
      return {
        summary: {
          totalIncome: 0,
          totalServices: 0,
          currency: 'USD',
        },
        employees: [],
        meta: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    // 3. Obtener currency de los servicios de la compañía
    const firstService = await this.serviceRepository.findOne({
      where: { companyId: company.id },
    });
    const currency = firstService?.currency || 'USD';

    // 4. Consultar ingresos agrupados por empleado (todos para calcular summary)
    const allResults = await this.sessionDetailRepository
      .createQueryBuilder('sd')
      .select('sd.company_worker_id', 'companyWorkerId')
      .addSelect('SUM(sd.cost)', 'totalIncome')
      .addSelect('COUNT(*)', 'servicesCount')
      .where('sd.company_worker_id IN (:...workerIds)', { workerIds })
      .andWhere('sd.start_datetime BETWEEN :startDate AND :endDate', {
        startDate: `${startDate} 00:00:00`,
        endDate: `${endDate} 23:59:59`,
      })
      .andWhere('sd.status = :paid', { paid: 4 })
      // Las cortesías no cuentan como ingreso ni servicio pagado.
      .andWhere('sd.is_courtesy = 0')
      .groupBy('sd.company_worker_id')
      .orderBy('totalIncome', 'DESC')
      .getRawMany<WorkerIncomeRawRow>();

    const courtesyRows = await this.sessionDetailRepository
      .createQueryBuilder('sd')
      .select('sd.company_worker_id', 'companyWorkerId')
      .addSelect('COUNT(*)', 'courtesyServices')
      .where('sd.company_worker_id IN (:...workerIds)', { workerIds })
      .andWhere('sd.start_datetime BETWEEN :startDate AND :endDate', {
        startDate: `${startDate} 00:00:00`,
        endDate: `${endDate} 23:59:59`,
      })
      .andWhere('sd.status IN (:...completed)', { completed: [3, 4] })
      .andWhere('sd.is_courtesy = 1')
      .groupBy('sd.company_worker_id')
      .getRawMany<{ companyWorkerId: string; courtesyServices: string }>();

    const courtesyByWorker = new Map<number, number>();
    let courtesyServices = 0;
    for (const r of courtesyRows) {
      const n = parseInt(r.courtesyServices || '0', 10) || 0;
      courtesyByWorker.set(parseInt(r.companyWorkerId), n);
      courtesyServices += n;
    }

    // 5. Calcular totales generales (solo ingreso pagado)
    const totalIncome = allResults.reduce(
      (sum, r) => sum + parseFloat(r.totalIncome || '0'),
      0,
    );
    const totalServices = allResults.reduce(
      (sum, r) => sum + parseInt(r.servicesCount || '0'),
      0,
    );

    const incomeByWorker = new Map<
      number,
      { totalIncome: number; servicesCount: number }
    >();
    for (const r of allResults) {
      incomeByWorker.set(parseInt(r.companyWorkerId), {
        totalIncome: parseFloat(r.totalIncome || '0'),
        servicesCount: parseInt(r.servicesCount || '0', 10) || 0,
      });
    }

    const combined = [
      ...new Set([...incomeByWorker.keys(), ...courtesyByWorker.keys()]),
    ]
      .map((cwId) => ({
        companyWorkerId: cwId,
        totalIncome: incomeByWorker.get(cwId)?.totalIncome ?? 0,
        servicesCount: incomeByWorker.get(cwId)?.servicesCount ?? 0,
        courtesyServices: courtesyByWorker.get(cwId) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.totalIncome - a.totalIncome ||
          b.courtesyServices - a.courtesyServices ||
          a.companyWorkerId - b.companyWorkerId,
      );

    // 7. Paginar resultados
    const total = combined.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedResults = combined.slice(skip, skip + limit);

    // 8. Mapear empleados con nombre, imagen y porcentaje
    const workerMap = new Map(companyWorkers.map((cw) => [cw.id, cw]));

    const employeesResponse = paginatedResults.map((r) => {
      const cw = workerMap.get(r.companyWorkerId);
      const income = r.totalIncome;
      const workerName = cw?.worker
        ? (cw.worker.name || '').trim()
        : 'Empleado eliminado';
      return {
        companyWorkerId: r.companyWorkerId,
        name: workerName,
        image: cw?.worker?.picture
          ? this.fileUploadService.getFileUrl(
              this.WORKER_PHOTO_FOLDER,
              cw.worker.picture,
            )
          : null,
        totalIncome: parseFloat(income.toFixed(2)),
        servicesCount: r.servicesCount,
        // Cortesías de este empleado en el rango (aparte de servicesCount).
        courtesyServices: r.courtesyServices,
        percentage:
          totalIncome > 0
            ? parseFloat(((income / totalIncome) * 100).toFixed(2))
            : 0,
        currency,
      };
    });

    return {
      summary: {
        totalIncome: parseFloat(totalIncome.toFixed(2)),
        totalServices,
        currency,
        // Cortesías del rango, aparte del ingreso (front las nota, no las suma).
        courtesyServices,
      },
      employees: employeesResponse,
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
   * Ingresos POR COMPAÑÍA: solo la parte que le corresponde a la company
   * (`session_detail.total_company`), en caja real (cobros con `collected_at`).
   *
   * El rango se aplica sobre `collected_at` (cuándo entró el dinero, no la fecha
   * de la cita). Devuelve el total por moneda (USD/EUR/VES) en su propia moneda,
   * y un total en Bs ACUMULADO: cada cobro se convierte con la tasa histórica del
   * momento del cobro (`session_payment_lines.exchange_rate`), nunca con la tasa
   * de hoy. VES cuenta ×1.
   */
  async getCompanyIncome(adminId: number, startDate: string, endDate: string) {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    const rows: Array<{
      currency: string;
      details: string;
      companyAmount: string | null;
      companyAmountBs: string | null;
      missingRate: string;
    }> = await this.sessionDetailRepository.query(
      // La tasa se pre-agrega por (payment, moneda) para no multiplicar filas si
      // un cobro tuviera más de un renglón en la misma moneda.
      `SELECT UPPER(COALESCE(svc.currency, 'USD')) AS currency,
              COUNT(*) AS details,
              ROUND(SUM(sd.total_company), 2) AS companyAmount,
              ROUND(
                SUM(
                  sd.total_company *
                  COALESCE(
                    rate.rate,
                    IF(UPPER(COALESCE(svc.currency, 'USD')) = 'VES', 1, NULL)
                  )
                ),
                2
              ) AS companyAmountBs,
              SUM(
                CASE
                  WHEN UPPER(COALESCE(svc.currency, 'USD')) <> 'VES'
                       AND rate.rate IS NULL THEN 1
                  ELSE 0
                END
              ) AS missingRate
         FROM session_payments sp
         JOIN session_detail sd
           ON sd.session_id = sp.session_id
          AND sd.status = 4
          AND sd.is_courtesy = 0
         JOIN company_worker cw
           ON cw.id = sd.company_worker_id
          AND cw.company_id = ?
         LEFT JOIN service svc ON svc.id = sd.service_id
         LEFT JOIN (
           SELECT payment_id, UPPER(currency) AS cur, AVG(exchange_rate) AS rate
             FROM session_payment_lines
            GROUP BY payment_id, UPPER(currency)
         ) rate
           ON rate.payment_id = sp.id
          AND rate.cur = UPPER(COALESCE(svc.currency, 'USD'))
        WHERE sp.collected_at IS NOT NULL
          AND sp.collected_at BETWEEN ? AND ?
        GROUP BY UPPER(COALESCE(svc.currency, 'USD'))`,
      [company.id, `${startDate} 00:00:00`, `${endDate} 23:59:59`],
    );

    // Total por moneda (se omiten las monedas donde la company no ganó nada) y
    // total en Bs acumulado (suma de cada cobro a su tasa histórica).
    const byCurrency = rows
      .map((r) => ({
        currency: r.currency,
        companyAmount: parseFloat(r.companyAmount || '0'),
      }))
      .filter((r) => r.companyAmount > 0)
      .sort((a, b) => b.companyAmount - a.companyAmount);

    const totalBsAccumulated = parseFloat(
      rows
        .reduce((sum, r) => sum + parseFloat(r.companyAmountBs || '0'), 0)
        .toFixed(2),
    );
    const missingRateDetails = rows.reduce(
      (sum, r) => sum + (parseInt(r.missingRate || '0', 10) || 0),
      0,
    );

    return {
      range: { startDate, endDate },
      // Caja real: solo lo efectivamente cobrado (collected_at), por fecha de cobro.
      basis: 'collected' as const,
      byCurrency,
      totalBsAccumulated,
      meta: {
        // Renglones con moneda extranjera sin tasa histórica → no sumaron a Bs.
        missingRateDetails,
      },
    };
  }

  // ===========================================================================
  // Reporte de clientes (activos / nuevos / perdidos)
  // ---------------------------------------------------------------------------
  // Definiciones de negocio (ventanas móviles, ver clients-report.util.ts):
  //   - Activo:   cliente con >=1 cita no cancelada en los últimos 30 días.
  //   - Perdido:  su última cita fue hace más de 60 días (sin ninguna posterior).
  //   - Nuevo:    su primera cita con la compañía fue en los últimos 30 días,
  //               o el usuario se registró en los últimos 30 días.
  // ===========================================================================

  /**
   * Resumen actual + serie histórica de clientes.
   * Modo por granularidad si se pasa `granularity`; modo por rango si se pasan
   * `startDate`, `endDate` (y opcionalmente `bucket`, default mensual).
   */
  async getClientsReport(
    adminId: number,
    options: {
      granularity?: Granularity;
      startDate?: string;
      endDate?: string;
      bucket?: Bucket;
    },
  ) {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    const now = new Date();
    const activities = await this.loadClientActivities(company.id);

    // Resumen al día de hoy.
    const summary = {
      activeClients: activities.filter((a) => this.isActiveAt(a, now.getTime()))
        .length,
      newClients: activities.filter((a) => this.isNewAt(a, now.getTime()))
        .length,
      churnedClients: activities.filter((a) =>
        this.isChurnedAt(a, now.getTime()),
      ).length,
    };

    // Períodos de la serie histórica.
    let periods: ReportPeriod[];
    if (options.granularity) {
      periods = generateGranularityPeriods(options.granularity, now);
    } else if (options.startDate && options.endDate) {
      periods = generateBucketPeriods(
        options.startDate,
        options.endDate,
        options.bucket ?? 'mensual',
      );
    } else {
      throw new BadRequestException(
        'Debe enviar "granularity" o el par "startDate" + "endDate".',
      );
    }

    const trend = periods.map((p) => {
      const startMs = p.start.getTime();
      const endMs = p.end.getTime();
      return {
        label: p.label,
        start: formatISODate(p.start),
        end: formatISODate(p.end),
        active: activities.filter((a) => this.isActiveAt(a, endMs)).length,
        joined: activities.filter((a) => this.joinedInPeriod(a, startMs, endMs))
          .length,
        churned: activities.filter((a) =>
          this.churnedInPeriod(a, startMs, endMs),
        ).length,
      };
    });

    return { summary, trend };
  }

  /** Lista de clientes de una categoría (para el modal de cada tarjeta). */
  async getClientsList(
    adminId: number,
    category: 'active' | 'new' | 'churned',
  ) {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    const nowMs = Date.now();
    const activities = await this.loadClientActivities(company.id);

    const predicate =
      category === 'active'
        ? (a: ClientActivity) => this.isActiveAt(a, nowMs)
        : category === 'new'
          ? (a: ClientActivity) => this.isNewAt(a, nowMs)
          : (a: ClientActivity) => this.isChurnedAt(a, nowMs);

    return activities
      .filter(predicate)
      .map((a) => this.toClientListItem(a.client, company.id));
  }

  // --- Helpers internos ------------------------------------------------------

  /**
   * Carga, para todos los clientes de la compañía, sus citas no canceladas
   * (a través de session → session_detail → service), la fecha de primera cita
   * y la fecha de registro del usuario.
   */
  private async loadClientActivities(
    companyId: number,
  ): Promise<ClientActivity[]> {
    // Clientes de la compañía (excluye eliminados), con su usuario.
    const clients = await this.clientRepository
      .createQueryBuilder('client')
      .leftJoinAndSelect('client.user', 'user')
      .where('JSON_CONTAINS(client.companies, :companyId)', {
        companyId: JSON.stringify(companyId),
      })
      .andWhere('client.permanently_deleted = :no', { no: false })
      .andWhere('client.temporarily_deleted = :no', { no: false })
      .getMany();

    if (clients.length === 0) return [];

    const clientIds = clients.map((c) => c.id);

    // Citas (sessions) no canceladas de esos clientes que tocan un servicio
    // de esta compañía. DISTINCT porque una cita puede tener varios detalles.
    const rows = await this.sessionRepository
      .createQueryBuilder('s')
      .innerJoin(SessionDetail, 'sd', 'sd.session_id = s.id')
      .innerJoin(Service, 'srv', 'srv.id = sd.service_id')
      .select('s.id', 'sessionId')
      .addSelect('s.client_id', 'clientId')
      .addSelect('s.start_datetime', 'startDatetime')
      .addSelect('s.session_datetime', 'sessionDatetime')
      .where('srv.company_id = :companyId', { companyId })
      .andWhere('s.client_id IN (:...clientIds)', { clientIds })
      .andWhere('s.status != :cancelled', {
        cancelled: this.CANCELLED_SESSION_STATUS,
      })
      .groupBy('s.id')
      .getRawMany<ClientApptRawRow>();

    // Agrupar timestamps de citas por cliente.
    const apptsByClient = new Map<number, number[]>();
    for (const r of rows) {
      const rawDate = r.startDatetime ?? r.sessionDatetime;
      if (!rawDate) continue;
      const ms = new Date(rawDate).getTime();
      if (Number.isNaN(ms)) continue;
      const clientId = Number(r.clientId);
      const list = apptsByClient.get(clientId) ?? [];
      list.push(ms);
      apptsByClient.set(clientId, list);
    }

    return clients.map((client) => {
      const appointments = (apptsByClient.get(client.id) ?? []).sort(
        (a, b) => a - b,
      );

      // Primera cita con esta compañía (campo persistido); fallback a la cita
      // más antigua conocida.
      const firstEntry = (client.companyFirstAppointments ?? []).find(
        (fa) => Number(fa.companyId) === companyId,
      );
      let firstAppointmentMs: number | null = null;
      if (firstEntry?.firstAppointmentDate) {
        const ms = new Date(firstEntry.firstAppointmentDate).getTime();
        if (!Number.isNaN(ms)) firstAppointmentMs = ms;
      }
      if (firstAppointmentMs === null && appointments.length > 0) {
        firstAppointmentMs = appointments[0];
      }

      const registeredMs = client.user?.createdAt
        ? new Date(client.user.createdAt).getTime()
        : null;

      return { client, appointments, firstAppointmentMs, registeredMs };
    });
  }

  /** Activo en `refMs`: tiene una cita dentro de la ventana de actividad. */
  private isActiveAt(a: ClientActivity, refMs: number): boolean {
    const windowStart = refMs - this.ACTIVE_WINDOW_MS;
    return a.appointments.some((t) => t > windowStart && t <= refMs);
  }

  /** Perdido en `refMs`: tuvo citas, pero la última fue antes de la ventana de churn. */
  private isChurnedAt(a: ClientActivity, refMs: number): boolean {
    const relevant = a.appointments.filter((t) => t <= refMs);
    if (relevant.length === 0) return false;
    const last = relevant[relevant.length - 1];
    return last < refMs - this.CHURN_WINDOW_MS;
  }

  /** Nuevo en `refMs`: primera cita o registro dentro de la ventana de actividad. */
  private isNewAt(a: ClientActivity, refMs: number): boolean {
    const windowStart = refMs - this.ACTIVE_WINDOW_MS;
    const byFirstAppt =
      a.firstAppointmentMs !== null &&
      a.firstAppointmentMs > windowStart &&
      a.firstAppointmentMs <= refMs;
    const byRegistration =
      a.registeredMs !== null &&
      a.registeredMs > windowStart &&
      a.registeredMs <= refMs;
    return byFirstAppt || byRegistration;
  }

  /** Se incorporó dentro del período [startMs, endMs]. */
  private joinedInPeriod(
    a: ClientActivity,
    startMs: number,
    endMs: number,
  ): boolean {
    const inRange = (t: number | null) =>
      t !== null && t >= startMs && t <= endMs;
    return inRange(a.firstAppointmentMs) || inRange(a.registeredMs);
  }

  /**
   * Cruzó el umbral de pérdida dentro del período: existe un "evento de churn"
   * (última cita de una racha + 60 días) que cae en [startMs, endMs]. Un cliente
   * puede perderse, volver y perderse de nuevo.
   */
  private churnedInPeriod(
    a: ClientActivity,
    startMs: number,
    endMs: number,
  ): boolean {
    const appts = a.appointments;
    for (let i = 0; i < appts.length; i++) {
      const isLast = i === appts.length - 1;
      const gapTooBig =
        !isLast && appts[i + 1] - appts[i] > this.CHURN_WINDOW_MS;
      if (isLast || gapTooBig) {
        const churnMs = appts[i] + this.CHURN_WINDOW_MS;
        if (churnMs >= startMs && churnMs <= endMs) return true;
      }
    }
    return false;
  }

  /** Mapea un Client al item del listado, usando el alias de la compañía si existe. */
  private toClientListItem(client: Client, companyId: number) {
    const alias = (client.companyAliases ?? []).find(
      (entry) => Number(entry.companyId) === companyId,
    )?.alias;
    const fullName = `${client.name ?? ''} ${client.lastName ?? ''}`.trim();
    return {
      id: client.id,
      name: (alias && alias.trim()) || fullName || 'Cliente',
      image: client.picture
        ? this.fileUploadService.getFileUrl(
            this.CLIENT_PHOTO_FOLDER,
            client.picture,
          )
        : '',
      phone: client.phone ?? '',
      email: client.email ?? '',
    };
  }
}
