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
  TimelineBucket,
  Granularity,
  ReportPeriod,
  generateBucketPeriods,
  generateTimelineBuckets,
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
  // Comisión del trabajador (SUM total_worker), para la vista "ganancia del empleado".
  workerIncome?: string | null;
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

  /**
   * Reporte de productos
   */
  async getIncomeByProducts(
    adminId: number,
    startDate: string,
    endDate: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    interface ProductSaleRawRow {
      productId: string;
      name: string | null;
      currency: string;
      units: string | null;
      clientUnits: string | null;
      workerUnits: string | null;
      revenueMinor: string | null;
      costMinor: string | null;
      commissionMinor: string | null;
      // Fecha de la venta más reciente del producto en el rango (YYYY-MM-DD).
      lastSaleAt: string | null;
    }

    const rows: ProductSaleRawRow[] =
      await this.companyRepository.manager.query(
        `SELECT sp.product_id AS productId, p.name AS name, sp.currency AS currency,
              SUM(sp.quantity) AS units,
              SUM(CASE WHEN sp.sale_type = 'client' THEN sp.quantity ELSE 0 END) AS clientUnits,
              SUM(CASE WHEN sp.sale_type = 'worker_purchase' THEN sp.quantity ELSE 0 END) AS workerUnits,
              SUM(sp.unit_price_minor * sp.quantity) AS revenueMinor,
              SUM(sp.cost_minor) AS costMinor,
              SUM(sp.commission_minor) AS commissionMinor,
              DATE_FORMAT(MAX(sp.created_at), '%Y-%m-%d') AS lastSaleAt
         FROM session_product sp
         LEFT JOIN product p ON p.id = sp.product_id
        WHERE sp.company_id = ?
          AND sp.created_at BETWEEN ? AND ?
        GROUP BY sp.product_id, p.name, sp.currency
        ORDER BY revenueMinor DESC`,
        [company.id, `${startDate} 00:00:00`, `${endDate} 23:59:59`],
      );

    const num = (v: string | null): number => Number(v ?? 0) || 0;

    const products = rows.map((r) => {
      const revenueMinor = num(r.revenueMinor);
      const costMinor = num(r.costMinor);
      const commissionMinor = num(r.commissionMinor);
      return {
        productId: Number(r.productId),
        name: r.name || 'Producto eliminado',
        currency: r.currency,
        unitsSold: num(r.units),
        clientUnits: num(r.clientUnits),
        workerUnits: num(r.workerUnits),
        revenueMinor,
        costMinor,
        commissionMinor,
        companyProfitMinor: revenueMinor - costMinor - commissionMinor,
        lastSaleAt: r.lastSaleAt ?? null,
      };
    });

    // Totales por moneda (no se convierten entre sí) + contadores globales.
    const byCurrency = new Map<
      string,
      {
        currency: string;
        unitsSold: number;
        revenueMinor: number;
        costMinor: number;
        commissionMinor: number;
        companyProfitMinor: number;
      }
    >();
    let totalUnits = 0;
    let clientUnits = 0;
    let workerUnits = 0;
    for (const p of products) {
      totalUnits += p.unitsSold;
      clientUnits += p.clientUnits;
      workerUnits += p.workerUnits;
      const acc = byCurrency.get(p.currency) ?? {
        currency: p.currency,
        unitsSold: 0,
        revenueMinor: 0,
        costMinor: 0,
        commissionMinor: 0,
        companyProfitMinor: 0,
      };
      acc.unitsSold += p.unitsSold;
      acc.revenueMinor += p.revenueMinor;
      acc.costMinor += p.costMinor;
      acc.commissionMinor += p.commissionMinor;
      acc.companyProfitMinor += p.companyProfitMinor;
      byCurrency.set(p.currency, acc);
    }

    const total = products.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const skip = (page - 1) * limit;

    return {
      range: { startDate, endDate },
      summary: {
        byCurrency: [...byCurrency.values()],
        totalUnits,
        clientUnits,
        workerUnits,
        distinctProducts: total,
      },
      products: products.slice(skip, skip + limit),
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
   * Comisiones de productos por empleado: quiénes ganaron comisión vendiendo
   * productos y de qué productos, dentro del rango. Las comisiones no se
   * convierten entre monedas (se agrupan por moneda). Alimenta la vista
   * "Empleados" del reporte de productos.
   */
  async getProductCommissionsByEmployee(
    adminId: number,
    startDate: string,
    endDate: string,
  ) {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    interface Row {
      employeeId: string;
      employeeName: string | null;
      productId: string;
      productName: string | null;
      currency: string;
      units: string | null;
      commissionMinor: string | null;
    }

    const rows: Row[] = await this.companyRepository.manager.query(
      `SELECT sp.seller_employee_id AS employeeId,
              w.name AS employeeName,
              sp.product_id AS productId,
              p.name AS productName,
              sp.currency AS currency,
              SUM(sp.quantity) AS units,
              SUM(sp.commission_minor) AS commissionMinor
         FROM session_product sp
         LEFT JOIN product p ON p.id = sp.product_id
         LEFT JOIN company_worker cw ON cw.id = sp.seller_employee_id
         LEFT JOIN worker w ON w.id = cw.worker_id
        WHERE sp.company_id = ?
          AND sp.created_at BETWEEN ? AND ?
          AND sp.seller_employee_id IS NOT NULL
          AND sp.commission_minor > 0
        GROUP BY sp.seller_employee_id, w.name, sp.product_id, p.name, sp.currency
        ORDER BY commissionMinor DESC`,
      [company.id, `${startDate} 00:00:00`, `${endDate} 23:59:59`],
    );

    const num = (v: string | null): number => Number(v ?? 0) || 0;

    type ProductLine = {
      productId: number;
      name: string;
      currency: string;
      units: number;
      commissionMinor: number;
    };
    // suma cruda por moneda para ordenar; totalsByCurrency guarda el detalle.
    const byEmployee = new Map<
      number,
      {
        employeeId: number;
        name: string;
        products: ProductLine[];
        totalsByCurrency: Map<string, number>;
        sortValue: number;
      }
    >();
    for (const r of rows) {
      const employeeId = Number(r.employeeId);
      const commissionMinor = num(r.commissionMinor);
      const agg = byEmployee.get(employeeId) ?? {
        employeeId,
        name: r.employeeName || `Empleado #${employeeId}`,
        products: [],
        totalsByCurrency: new Map<string, number>(),
        sortValue: 0,
      };
      agg.products.push({
        productId: Number(r.productId),
        name: r.productName || 'Producto eliminado',
        currency: r.currency,
        units: num(r.units),
        commissionMinor,
      });
      agg.totalsByCurrency.set(
        r.currency,
        (agg.totalsByCurrency.get(r.currency) ?? 0) + commissionMinor,
      );
      agg.sortValue += commissionMinor;
      byEmployee.set(employeeId, agg);
    }

    const employees = [...byEmployee.values()]
      .sort((a, b) => b.sortValue - a.sortValue)
      .map((e) => ({
        employeeId: e.employeeId,
        name: e.name,
        products: e.products.map((p) => ({
          productId: p.productId,
          name: p.name,
          currency: p.currency,
          units: p.units,
          commissionMinor: p.commissionMinor,
        })),
        totalsByCurrency: [...e.totalsByCurrency.entries()].map(
          ([currency, commissionMinor]) => ({ currency, commissionMinor }),
        ),
      }));

    return {
      range: { startDate, endDate },
      employees,
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
      // Lo que se lleva el empleado (su comisión), para la vista alterna.
      .addSelect('SUM(sd.total_worker)', 'workerIncome')
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
    // Total de comisiones de los empleados (vista "ganancia del empleado").
    const totalWorkerIncome = allResults.reduce(
      (sum, r) => sum + parseFloat(r.workerIncome || '0'),
      0,
    );
    const totalServices = allResults.reduce(
      (sum, r) => sum + parseInt(r.servicesCount || '0'),
      0,
    );

    const incomeByWorker = new Map<
      number,
      { totalIncome: number; workerIncome: number; servicesCount: number }
    >();
    for (const r of allResults) {
      incomeByWorker.set(parseInt(r.companyWorkerId), {
        totalIncome: parseFloat(r.totalIncome || '0'),
        workerIncome: parseFloat(r.workerIncome || '0'),
        servicesCount: parseInt(r.servicesCount || '0', 10) || 0,
      });
    }

    const combined = [
      ...new Set([...incomeByWorker.keys(), ...courtesyByWorker.keys()]),
    ]
      .map((cwId) => ({
        companyWorkerId: cwId,
        totalIncome: incomeByWorker.get(cwId)?.totalIncome ?? 0,
        workerIncome: incomeByWorker.get(cwId)?.workerIncome ?? 0,
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
        // Lo que se lleva el empleado (su comisión) en el rango.
        workerIncome: parseFloat(r.workerIncome.toFixed(2)),
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
        // Suma de comisiones de los empleados (para la vista alterna del front).
        totalWorkerIncome: parseFloat(totalWorkerIncome.toFixed(2)),
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
   * de la cita). Se separan TRES cosas, para no mezclar "moneda del servicio" con
   * "cómo entró la plata" (mismo criterio que nómina):
   *   - `byCurrency`   → VALOR nominal por moneda del servicio (lo que cuesta).
   *   - `received.cash`→ RECIBIDO en efectivo, solo moneda extranjera ($/€):
   *                      cobros con `method = cash` de servicios en $/€, en su moneda.
   *   - `received.bsAccumulated` → todo lo demás (digital + efectivo en Bs)
   *                      convertido a Bs con la tasa histórica de cada cobro.
   * `totalBsAccumulated` = TODO llevado a Bs (incluye el efectivo extranjero),
   * como referencia. El desglose por servicio viene partido igual (cash vs Bs).
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

    // Una fila por detalle cobrado. La tasa se pre-agrega por (payment, moneda)
    // para no multiplicar filas si un cobro tuviera >1 renglón en esa moneda.
    const rows: Array<{
      serviceId: number;
      serviceName: string | null;
      svcCurrency: string;
      method: string | null;
      companyAmount: string | null;
      billedAmount: string | null;
      rate: string | null;
    }> = await this.sessionDetailRepository.query(
      `SELECT sd.service_id AS serviceId,
              svc.name AS serviceName,
              UPPER(COALESCE(svc.currency, 'USD')) AS svcCurrency,
              sp.method AS method,
              sd.total_company AS companyAmount,
              sd.cost AS billedAmount,
              rate.rate AS rate
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
          AND sp.collected_at BETWEEN ? AND ?`,
      [company.id, `${startDate} 00:00:00`, `${endDate} 23:59:59`],
    );

    // Ajustes a favor/en contra de la company (sobrepago/faltante), en Bs
    const adjRow: Array<{ adjustmentsBs: string | null }> =
      await this.sessionDetailRepository.query(
        `SELECT COALESCE(SUM(sp.company_adjustment_bs), 0) AS adjustmentsBs
           FROM session_payments sp
          WHERE sp.collected_at IS NOT NULL
            AND sp.collected_at BETWEEN ? AND ?
            AND sp.company_adjustment_bs IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM session_detail sd
                JOIN company_worker cw ON cw.id = sd.company_worker_id
               WHERE sd.session_id = sp.session_id AND cw.company_id = ?
            )`,
        [`${startDate} 00:00:00`, `${endDate} 23:59:59`, company.id],
      );
    const adjustmentsBs = parseFloat(adjRow[0]?.adjustmentsBs || '0') || 0;

    const nominal = new Map<string, number>(); // moneda del servicio → valor
    const cashTotals = new Map<string, number>(); // moneda extranjera → efectivo
    let bsAccumulated = 0; // digital + efectivo Bs, a tasa histórica
    let totalBsAccumulated = 0; // TODO a Bs (incluye efectivo extranjero)
    let missingRateDetails = 0;

    interface SvcAgg {
      serviceName: string;
      servicesCount: number;
      nominal: Map<string, number>; // valor del servicio por moneda (nominal)
      cash: Map<string, number>;
      bsAccumulated: number;
      sortBs: number; // Bs-equivalente de todo (para ordenar entre monedas)
      companyTotal: number; // Σ parte del negocio (para el % ponderado)
      billedTotal: number; // Σ total facturado (para el % ponderado)
    }
    const svcMap = new Map<number, SvcAgg>();

    for (const r of rows) {
      const amount = parseFloat(r.companyAmount || '0') || 0;
      const cur = (r.svcCurrency || 'USD').toUpperCase();
      const isForeign = cur !== 'VES';
      const isCash = r.method === 'cash';
      const rate = r.rate != null ? parseFloat(r.rate) : null;

      // Valor nominal por moneda del servicio.
      nominal.set(cur, (nominal.get(cur) ?? 0) + amount);

      // Bs-equivalente de TODO (para el total de referencia y el orden).
      const bsEquiv = isForeign
        ? rate != null
          ? amount * rate
          : null
        : amount;
      if (bsEquiv != null) totalBsAccumulated += bsEquiv;

      const svc = svcMap.get(Number(r.serviceId)) ?? {
        serviceName: (r.serviceName || 'Servicio').trim(),
        servicesCount: 0,
        nominal: new Map<string, number>(),
        cash: new Map<string, number>(),
        bsAccumulated: 0,
        sortBs: 0,
        companyTotal: 0,
        billedTotal: 0,
      };
      svc.servicesCount += 1;
      svc.sortBs += bsEquiv ?? 0;
      // Valor nominal por moneda del servicio (mismo criterio que byCurrency).
      svc.nominal.set(cur, (svc.nominal.get(cur) ?? 0) + amount);
      // Para el % ponderado del negocio en este servicio (parte ÷ facturado).
      svc.companyTotal += amount;
      svc.billedTotal += parseFloat(r.billedAmount || '0') || 0;

      if (isCash && isForeign) {
        // Efectivo en moneda extranjera → se queda en su moneda.
        cashTotals.set(cur, (cashTotals.get(cur) ?? 0) + amount);
        svc.cash.set(cur, (svc.cash.get(cur) ?? 0) + amount);
      } else {
        // Todo lo demás → Bs a tasa histórica (VES nativo ×1).
        const bsAmt = isForeign ? (rate != null ? amount * rate : 0) : amount;
        if (isForeign && rate == null) missingRateDetails += 1;
        bsAccumulated += bsAmt;
        svc.bsAccumulated += bsAmt;
      }
      svcMap.set(Number(r.serviceId), svc);
    }

    const round2 = (n: number): number => parseFloat(n.toFixed(2));
    const mapToSortedList = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([currency, amount]) => ({
          currency,
          companyAmount: round2(amount),
        }))
        .filter((x) => x.companyAmount > 0)
        .sort((a, b) => b.companyAmount - a.companyAmount);

    const byService = [...svcMap.entries()]
      .map(([serviceId, s]) => ({
        serviceId,
        serviceName: s.serviceName,
        servicesCount: s.servicesCount,
        // % del negocio en este servicio, ponderado (parte ÷ facturado × 100).
        // Cuadra con los montos: un mismo servicio con distintos % por trabajador
        // queda con el efectivo ponderado.
        companyPercentage:
          s.billedTotal > 0
            ? round2((s.companyTotal / s.billedTotal) * 100)
            : 0,
        // Valor nominal por moneda (la suma de todos los servicios == byCurrency).
        nominal: mapToSortedList(s.nominal),
        // Efectivo en moneda extranjera (una entrada por moneda).
        cash: mapToSortedList(s.cash),
        // Resto (digital + efectivo Bs) a tasa histórica.
        bsAccumulated: round2(s.bsAccumulated),
      }))
      .filter((s) => s.cash.length > 0 || s.bsAccumulated > 0)
      .sort(
        (a, b) =>
          (svcMap.get(b.serviceId)!.sortBs || 0) -
          (svcMap.get(a.serviceId)!.sortBs || 0),
      );

    return {
      range: { startDate, endDate },
      // Caja real: solo lo efectivamente cobrado (collected_at), por fecha de cobro.
      basis: 'collected' as const,
      // Valor nominal de los servicios, por moneda del servicio ("lo que cuesta").
      byCurrency: mapToSortedList(nominal),
      // Cómo entró realmente el dinero (criterio nómina). El ajuste (sobrepago/
      // faltante) va 100% a la company y suma al ingreso en Bs.
      received: {
        cash: mapToSortedList(cashTotals),
        bsAccumulated: round2(bsAccumulated + adjustmentsBs),
      },
      byService,
      // Referencia: TODO llevado a Bs (incluye el efectivo extranjero convertido).
      totalBsAccumulated: round2(totalBsAccumulated + adjustmentsBs),
      meta: {
        // Detalles en moneda extranjera SIN tasa histórica → no sumaron a Bs.
        missingRateDetails,
        // Sobrepagos/faltantes a favor de la company incluidos en el Bs (auditoría).
        // No se reparten por servicio (no son atribuibles a uno).
        adjustmentsBs: round2(adjustmentsBs),
      },
    };
  }

  /**
   * Serie temporal de "Ingresos por compañía". Mismo criterio que el reporte
   * (solo parte del negocio, solo cobros con `collected_at`, sin cortesías,
   * status = 4). Cada punto se ubica por la FECHA DE COBRO y trae las mismas tres
   * magnitudes que `byService` (nominal / cash / bsAccumulated), para reusar el
   * selector de vistas sin mezclar monedas. Los períodos vacíos van en cero.
   */
  async getCompanyIncomeTimeline(
    adminId: number,
    startDate: string,
    endDate: string,
    bucket: TimelineBucket,
  ) {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    const buckets = generateTimelineBuckets(startDate, endDate, bucket);
    const bucketStarts = buckets.map((b) => b.start.getTime());
    // Un acumulador por bucket (mismas 3 magnitudes que byService).
    const acc = buckets.map(() => ({
      nominal: new Map<string, number>(),
      cash: new Map<string, number>(),
      bsAccumulated: 0,
    }));
    let missingRateDetails = 0;

    const rows: Array<{
      svcCurrency: string;
      method: string | null;
      companyAmount: string | null;
      rate: string | null;
      collectedAt: Date | string;
    }> = await this.sessionDetailRepository.query(
      `SELECT UPPER(COALESCE(svc.currency, 'USD')) AS svcCurrency,
              sp.method AS method,
              sd.total_company AS companyAmount,
              sp.collected_at AS collectedAt,
              rate.rate AS rate
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
          AND sp.collected_at BETWEEN ? AND ?`,
      [company.id, `${startDate} 00:00:00`, `${endDate} 23:59:59`],
    );

    // Índice del bucket que contiene la fecha (buckets contiguos y ordenados):
    // el último cuyo `start` <= t (búsqueda binaria).
    const bucketIndexOf = (t: number): number => {
      let lo = 0;
      let hi = bucketStarts.length - 1;
      let idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (bucketStarts[mid] <= t) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return idx;
    };

    for (const r of rows) {
      const t = new Date(r.collectedAt).getTime();
      const idx = bucketIndexOf(t);
      if (idx < 0) continue; // fuera de rango (no debería pasar)
      const a = acc[idx];

      const amount = parseFloat(r.companyAmount || '0') || 0;
      const cur = (r.svcCurrency || 'USD').toUpperCase();
      const isForeign = cur !== 'VES';
      const isCash = r.method === 'cash';
      const rate = r.rate != null ? parseFloat(r.rate) : null;

      a.nominal.set(cur, (a.nominal.get(cur) ?? 0) + amount);
      if (isCash && isForeign) {
        a.cash.set(cur, (a.cash.get(cur) ?? 0) + amount);
      } else {
        const bsAmt = isForeign ? (rate != null ? amount * rate : 0) : amount;
        if (isForeign && rate == null) missingRateDetails += 1;
        a.bsAccumulated += bsAmt;
      }
    }

    // Ajustes (sobrepago/faltante) a favor de la company, por fecha de cobro. Una
    // fila por cobro; van 100% a la company y suman al Bs del bucket que toca.
    const adjRows: Array<{
      collectedAt: Date | string;
      adjustmentBs: string | null;
    }> = await this.sessionDetailRepository.query(
      `SELECT sp.collected_at AS collectedAt,
              sp.company_adjustment_bs AS adjustmentBs
         FROM session_payments sp
        WHERE sp.collected_at IS NOT NULL
          AND sp.collected_at BETWEEN ? AND ?
          AND sp.company_adjustment_bs IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM session_detail sd
              JOIN company_worker cw ON cw.id = sd.company_worker_id
             WHERE sd.session_id = sp.session_id AND cw.company_id = ?
          )`,
      [`${startDate} 00:00:00`, `${endDate} 23:59:59`, company.id],
    );
    for (const r of adjRows) {
      const idx = bucketIndexOf(new Date(r.collectedAt).getTime());
      if (idx < 0) continue;
      acc[idx].bsAccumulated += parseFloat(r.adjustmentBs || '0') || 0;
    }

    const round2 = (n: number): number => parseFloat(n.toFixed(2));
    const mapToSortedList = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([currency, amt]) => ({ currency, companyAmount: round2(amt) }))
        .filter((x) => x.companyAmount > 0)
        .sort((x, z) => z.companyAmount - x.companyAmount);

    const points = buckets.map((b, i) => ({
      start: formatISODate(b.start),
      end: formatISODate(b.end),
      nominal: mapToSortedList(acc[i].nominal),
      cash: mapToSortedList(acc[i].cash),
      bsAccumulated: round2(acc[i].bsAccumulated),
    }));

    return {
      range: { startDate, endDate },
      bucket,
      points,
      meta: { missingRateDetails },
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
