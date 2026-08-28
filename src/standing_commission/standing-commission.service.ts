import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { StandingCommission } from './entities/standing-commission.entity';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Service } from '../service/entities/service.entity';
import { CreateStandingCommissionDto } from './dto/create-standing-commission.dto';
import { UpdateStandingCommissionDto } from './dto/update-standing-commission.dto';

/** Comisión fija ya resuelta para un servicio (lista para expandir en el cobro). */
export interface ResolvedStandingCommission {
  standingId: number;
  companyWorkerId: number;
  workerName: string;
  basisMode: 'percentage' | 'fixed';
  value: number;
  currency: string | null;
  // De dónde salió: regla global (todos los servicios) o específica del servicio.
  source: 'global' | 'service';
}

@Injectable()
export class StandingCommissionService {
  constructor(
    @InjectRepository(StandingCommission)
    private readonly repo: Repository<StandingCommission>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CompanyWorker)
    private readonly workerRepository: Repository<CompanyWorker>,
    @InjectRepository(Service)
    private readonly serviceRepository: Repository<Service>,
  ) {}

  private async resolveCompanyId(adminId: number): Promise<number> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }
    return company.id;
  }

  /** Todas las reglas de la compañía (para las pantallas de configuración). */
  async list(adminId: number): Promise<StandingCommission[]> {
    const companyId = await this.resolveCompanyId(adminId);
    return this.repo.find({
      where: { companyId },
      order: { scope: 'ASC', companyWorkerId: 'ASC', id: 'ASC' },
    });
  }

  async create(
    adminId: number,
    dto: CreateStandingCommissionDto,
  ): Promise<StandingCommission> {
    const companyId = await this.resolveCompanyId(adminId);

    // El trabajador debe ser de la compañía.
    const worker = await this.workerRepository.findOne({
      where: { id: dto.companyWorkerId, companyId },
    });
    if (!worker) {
      throw new BadRequestException('El trabajador no pertenece a la compañía');
    }

    const isExclusion = !!dto.isExclusion;

    if (dto.scope === 'all_services') {
      if (isExclusion) {
        throw new BadRequestException(
          'Una exclusión debe apuntar a un servicio específico',
        );
      }
      // Una sola regla global por trabajador.
      const existingGlobal = await this.repo.findOne({
        where: {
          companyId,
          companyWorkerId: dto.companyWorkerId,
          scope: 'all_services',
          isExclusion: false,
        },
      });
      if (existingGlobal) {
        throw new ConflictException(
          'Ese trabajador ya tiene una comisión fija global; edítala en vez de crear otra',
        );
      }
    } else {
      // scope='service': el servicio debe ser de la compañía.
      const service = await this.serviceRepository.findOne({
        where: { id: dto.serviceId, companyId },
      });
      if (!service) {
        throw new BadRequestException('El servicio no pertenece a la compañía');
      }
      // No duplicar la misma fila (específica o exclusión) para ese servicio.
      const existing = await this.repo.findOne({
        where: {
          companyId,
          companyWorkerId: dto.companyWorkerId,
          scope: 'service',
          serviceId: dto.serviceId,
          isExclusion,
        },
      });
      if (existing) {
        throw new ConflictException(
          isExclusion
            ? 'Ese trabajador ya está excluido de este servicio'
            : 'Ese trabajador ya tiene una comisión fija en este servicio',
        );
      }
    }

    if (!isExclusion && dto.basisMode === 'fixed' && !dto.currency) {
      throw new BadRequestException('El monto fijo requiere una moneda');
    }

    const row = this.repo.create({
      companyId,
      companyWorkerId: dto.companyWorkerId,
      scope: dto.scope,
      serviceId: dto.scope === 'service' ? (dto.serviceId ?? null) : null,
      isExclusion,
      basisMode: isExclusion ? null : (dto.basisMode ?? null),
      value: isExclusion ? null : (dto.value ?? null),
      currency: isExclusion
        ? null
        : dto.basisMode === 'fixed'
          ? (dto.currency ?? '').toUpperCase()
          : null,
      isActive: true,
    });
    return this.repo.save(row);
  }

  async update(
    adminId: number,
    id: number,
    dto: UpdateStandingCommissionDto,
  ): Promise<StandingCommission> {
    const companyId = await this.resolveCompanyId(adminId);
    const row = await this.repo.findOne({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Comisión fija no encontrada');
    if (row.isExclusion) {
      throw new BadRequestException('Una exclusión no tiene monto que editar');
    }

    if (dto.basisMode !== undefined) row.basisMode = dto.basisMode;
    if (dto.value !== undefined) row.value = dto.value;
    if (dto.currency !== undefined) row.currency = dto.currency.toUpperCase();
    if (dto.isActive !== undefined) row.isActive = dto.isActive;

    const mode = row.basisMode;
    if (mode === 'fixed' && !row.currency) {
      throw new BadRequestException('El monto fijo requiere una moneda');
    }
    if (mode === 'percentage') row.currency = null;

    return this.repo.save(row);
  }

  async remove(adminId: number, id: number): Promise<{ id: number }> {
    const companyId = await this.resolveCompanyId(adminId);
    const row = await this.repo.findOne({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Comisión fija no encontrada');
    await this.repo.remove(row);
    return { id };
  }

  /**
   * Resuelve las comisiones fijas aplicables a cada servicio: específica manda
   * sobre global, las exclusiones quitan la global. Se usa en el cobro (pre-carga
   * de atribuciones) y en la pantalla de edición del servicio.
   */
  async resolveForServices(
    companyId: number,
    serviceIds: number[],
  ): Promise<Map<number, ResolvedStandingCommission[]>> {
    const result = new Map<number, ResolvedStandingCommission[]>();
    const uniqueIds = [
      ...new Set(serviceIds.filter((n) => Number.isFinite(n))),
    ];
    if (uniqueIds.length === 0) return result;

    const rows = await this.repo.find({
      where: { companyId, isActive: true },
    });

    // Nombres de los trabajadores involucrados (para mostrar en el cobro).
    const workerIds = [...new Set(rows.map((r) => r.companyWorkerId))];
    const workers = workerIds.length
      ? await this.workerRepository.find({ where: { id: In(workerIds) } })
      : [];
    const nameById = new Map(workers.map((w) => [w.id, w.worker?.name ?? '—']));

    const globals = rows.filter(
      (r) => r.scope === 'all_services' && !r.isExclusion,
    );

    const toResolved = (
      r: StandingCommission,
      source: 'global' | 'service',
    ): ResolvedStandingCommission => ({
      standingId: r.id,
      companyWorkerId: r.companyWorkerId,
      workerName: nameById.get(r.companyWorkerId) ?? '—',
      basisMode: r.basisMode as 'percentage' | 'fixed',
      value: Number(r.value),
      currency: r.currency,
      source,
    });

    for (const sid of uniqueIds) {
      const specifics = rows.filter(
        (r) => r.scope === 'service' && r.serviceId === sid && !r.isExclusion,
      );
      const specificWorkers = new Set(specifics.map((r) => r.companyWorkerId));
      const excluded = new Set(
        rows
          .filter(
            (r) =>
              r.scope === 'service' && r.serviceId === sid && r.isExclusion,
          )
          .map((r) => r.companyWorkerId),
      );

      const out: ResolvedStandingCommission[] = specifics.map((r) =>
        toResolved(r, 'service'),
      );
      for (const g of globals) {
        if (specificWorkers.has(g.companyWorkerId)) continue; // específica manda
        if (excluded.has(g.companyWorkerId)) continue; // excluida en este servicio
        out.push(toResolved(g, 'global'));
      }
      result.set(sid, out);
    }
    return result;
  }

  /** Versión pública por adminId, para el endpoint de la pantalla del servicio. */
  async resolveForServicesByAdmin(
    adminId: number,
    serviceIds: number[],
  ): Promise<Record<number, ResolvedStandingCommission[]>> {
    const companyId = await this.resolveCompanyId(adminId);
    const map = await this.resolveForServices(companyId, serviceIds);
    const obj: Record<number, ResolvedStandingCommission[]> = {};
    for (const [k, v] of map.entries()) obj[k] = v;
    return obj;
  }
}
