import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { StandingCommission } from './entities/standing-commission.entity';
import { CommissionRole } from './entities/commission-role.entity';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Service } from '../service/entities/service.entity';
import { CreateStandingCommissionDto } from './dto/create-standing-commission.dto';
import { UpdateStandingCommissionDto } from './dto/update-standing-commission.dto';

/** Roles por defecto que se siembran la primera vez (el admin luego edita). */
const DEFAULT_ROLES = ['Lavado de cabello', 'Recepción'];

/** Comisión fija ya resuelta para un servicio (lista para expandir en el cobro). */
export interface ResolvedStandingCommission {
  standingId: number;
  // 'worker' → persona fija; 'role' → hay que elegir la persona en el cobro.
  kind: 'worker' | 'role';
  companyWorkerId: number | null;
  workerName: string | null;
  commissionRoleId: number | null;
  roleName: string | null;
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
    @InjectRepository(CommissionRole)
    private readonly roleRepository: Repository<CommissionRole>,
  ) {}

  // ---------------------------------------------------------------------------
  // Roles (catálogo por compañía)
  // ---------------------------------------------------------------------------

  /** Lista los roles; si la compañía no tiene, siembra los por defecto. */
  async listRoles(adminId: number): Promise<CommissionRole[]> {
    const companyId = await this.resolveCompanyId(adminId);
    const existing = await this.roleRepository.find({
      where: { companyId },
      order: { id: 'ASC' },
    });
    if (existing.length > 0) return existing;
    const seeded = await this.roleRepository.save(
      DEFAULT_ROLES.map((name) =>
        this.roleRepository.create({ companyId, name, isActive: true }),
      ),
    );
    return seeded;
  }

  async createRole(adminId: number, name: string): Promise<CommissionRole> {
    const companyId = await this.resolveCompanyId(adminId);
    const clean = (name || '').trim();
    if (!clean) throw new BadRequestException('El rol necesita un nombre');
    const dup = await this.roleRepository.findOne({
      where: { companyId, name: clean },
    });
    if (dup) throw new ConflictException('Ya existe un rol con ese nombre');
    return this.roleRepository.save(
      this.roleRepository.create({ companyId, name: clean, isActive: true }),
    );
  }

  async updateRole(
    adminId: number,
    id: number,
    name: string,
  ): Promise<CommissionRole> {
    const companyId = await this.resolveCompanyId(adminId);
    const role = await this.roleRepository.findOne({
      where: { id, companyId },
    });
    if (!role) throw new NotFoundException('Rol no encontrado');
    const clean = (name || '').trim();
    if (!clean) throw new BadRequestException('El rol necesita un nombre');
    role.name = clean;
    return this.roleRepository.save(role);
  }

  async removeRole(adminId: number, id: number): Promise<{ id: number }> {
    const companyId = await this.resolveCompanyId(adminId);
    const role = await this.roleRepository.findOne({
      where: { id, companyId },
    });
    if (!role) throw new NotFoundException('Rol no encontrado');
    // Las reglas por rol se borran en cascada (FK ON DELETE CASCADE).
    await this.roleRepository.remove(role);
    return { id };
  }

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

    // Una fila es por PERSONA (companyWorkerId) o por ROL (commissionRoleId).
    const isRole = dto.commissionRoleId != null;
    if (isRole === (dto.companyWorkerId != null)) {
      throw new BadRequestException(
        'Indica un trabajador (por persona) o un rol (por rol), no ambos',
      );
    }

    if (isRole) {
      const role = await this.roleRepository.findOne({
        where: { id: dto.commissionRoleId!, companyId },
      });
      if (!role) throw new BadRequestException('El rol no existe');
    } else {
      const worker = await this.workerRepository.findOne({
        where: { id: dto.companyWorkerId!, companyId },
      });
      if (!worker) {
        throw new BadRequestException(
          'El trabajador no pertenece a la compañía',
        );
      }
    }

    const isExclusion = !!dto.isExclusion;
    if (isExclusion && isRole) {
      throw new BadRequestException('Las exclusiones son solo por persona');
    }

    // Filtro que identifica al "dueño" de la fila (persona o rol).
    const targetWhere = isRole
      ? { commissionRoleId: dto.commissionRoleId! }
      : { companyWorkerId: dto.companyWorkerId! };
    const targetName = isRole ? 'Ese rol' : 'Ese trabajador';

    if (dto.scope === 'all_services') {
      if (isExclusion) {
        throw new BadRequestException(
          'Una exclusión debe apuntar a un servicio específico',
        );
      }
      const existingGlobal = await this.repo.findOne({
        where: {
          companyId,
          ...targetWhere,
          scope: 'all_services',
          isExclusion: false,
        },
      });
      if (existingGlobal) {
        throw new ConflictException(
          `${targetName} ya tiene una comisión fija global; edítala en vez de crear otra`,
        );
      }
    } else {
      const service = await this.serviceRepository.findOne({
        where: { id: dto.serviceId, companyId },
      });
      if (!service) {
        throw new BadRequestException('El servicio no pertenece a la compañía');
      }
      const existing = await this.repo.findOne({
        where: {
          companyId,
          ...targetWhere,
          scope: 'service',
          serviceId: dto.serviceId,
          isExclusion,
        },
      });
      if (existing) {
        throw new ConflictException(
          isExclusion
            ? `${targetName} ya está excluido de este servicio`
            : `${targetName} ya tiene una comisión fija en este servicio`,
        );
      }
    }

    if (!isExclusion && dto.basisMode === 'fixed' && !dto.currency) {
      throw new BadRequestException('El monto fijo requiere una moneda');
    }

    const row = this.repo.create({
      companyId,
      companyWorkerId: isRole ? null : dto.companyWorkerId!,
      commissionRoleId: isRole ? dto.commissionRoleId! : null,
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

    // Nombres de trabajadores y roles involucrados (para mostrar en el cobro).
    const workerIds = [
      ...new Set(rows.map((r) => r.companyWorkerId).filter((n) => n != null)),
    ] as number[];
    const workers = workerIds.length
      ? await this.workerRepository.find({ where: { id: In(workerIds) } })
      : [];
    const workerNameById = new Map(
      workers.map((w) => [w.id, w.worker?.name ?? '—']),
    );

    const roleIds = [
      ...new Set(rows.map((r) => r.commissionRoleId).filter((n) => n != null)),
    ] as number[];
    const roles = roleIds.length
      ? await this.roleRepository.find({ where: { id: In(roleIds) } })
      : [];
    const roleNameById = new Map(roles.map((r) => [r.id, r.name]));

    // Clave del "dueño" de la fila (persona o rol), para dedup/exclusión.
    const keyOf = (r: StandingCommission): string =>
      r.commissionRoleId != null
        ? `r:${r.commissionRoleId}`
        : `w:${r.companyWorkerId}`;

    const globals = rows.filter(
      (r) => r.scope === 'all_services' && !r.isExclusion,
    );

    const toResolved = (
      r: StandingCommission,
      source: 'global' | 'service',
    ): ResolvedStandingCommission => {
      const isRole = r.commissionRoleId != null;
      return {
        standingId: r.id,
        kind: isRole ? 'role' : 'worker',
        companyWorkerId: r.companyWorkerId,
        workerName: isRole
          ? null
          : (workerNameById.get(r.companyWorkerId as number) ?? '—'),
        commissionRoleId: r.commissionRoleId,
        roleName: isRole
          ? (roleNameById.get(r.commissionRoleId as number) ?? '—')
          : null,
        basisMode: r.basisMode as 'percentage' | 'fixed',
        value: Number(r.value),
        currency: r.currency,
        source,
      };
    };

    for (const sid of uniqueIds) {
      const specifics = rows.filter(
        (r) => r.scope === 'service' && r.serviceId === sid && !r.isExclusion,
      );
      const specificKeys = new Set(specifics.map(keyOf));
      const excluded = new Set(
        rows
          .filter(
            (r) =>
              r.scope === 'service' && r.serviceId === sid && r.isExclusion,
          )
          .map(keyOf),
      );

      const out: ResolvedStandingCommission[] = specifics.map((r) =>
        toResolved(r, 'service'),
      );
      for (const g of globals) {
        const k = keyOf(g);
        if (specificKeys.has(k)) continue; // específica manda
        if (excluded.has(k)) continue; // excluida en este servicio
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
