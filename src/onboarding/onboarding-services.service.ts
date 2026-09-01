import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { ServiceCategory } from '../service_category/entities/service_category.entity';
import { Service } from '../service/entities/service.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { ServiceStatus } from '../service/enum/service-status.enum';
import { OnboardingService } from './onboarding.service';
import { normalizeName } from './utils/normalize-name.util';
import type {
  ConfirmCategoryDto,
  ConfirmServiceDto,
  ConfirmServicesDto,
} from './dto/confirm-services.dto';
import type { ConfirmServicesResponse } from './dto/confirm-services-response.dto';
import type { DefaultCategoryResponse } from './dto/default-category-response.dto';

/** Índice en memoria de lo que la company ya tiene, para el get-or-create. */
interface ExistingIndex<T> {
  byTemplateKey: Map<string, T>;
  byName: Map<string, T>;
}

/**
 * ONB-3: convierte las plantillas que el dueño confirmó en SUS categorías y
 * servicios reales.
 *
 * No crea entidades nuevas: reutiliza `service_category` y `service`, así que lo
 * creado es indistinguible de lo que el dueño hubiera cargado a mano.
 *
 * Todo ocurre en una sola transacción: o se crea la confirmación completa, o no
 * se crea nada.
 */
/**
 * Categoría que se crea al arrancar "desde cero". El dueño la puede renombrar
 * o borrar: no tiene `source_template_key`, así que es indistinguible de una
 * que hubiera creado a mano.
 */
export const DEFAULT_SCRATCH_CATEGORY_NAME = 'Servicio General';

@Injectable()
export class OnboardingServicesService {
  private readonly logger = new Logger(OnboardingServicesService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly onboardingService: OnboardingService,
  ) {}

  /**
   * Precio final para `service.cost`. Acepta el formato del API (`cost`) y el del
   * ticket (`priceMinor`, en centavos); si llegan los dos manda `cost`.
   * `undefined` = pendiente → NO se toca lo que ya estuviera guardado.
   */
  private resolveCost(dto: ConfirmServiceDto): number | undefined {
    if (dto.cost !== undefined && dto.cost !== null) return dto.cost;
    if (dto.priceMinor !== undefined && dto.priceMinor !== null)
      return dto.priceMinor / 100;
    return undefined;
  }

  /**
   * Comisión final para `service.percentage` (0-100). Acepta el formato del API
   * (`percentage`) y el del ticket (`commissionBps`, 10000 = 100%).
   */
  private resolvePercentage(dto: ConfirmServiceDto): number | undefined {
    if (dto.percentage !== undefined && dto.percentage !== null)
      return dto.percentage;
    if (dto.commissionBps !== undefined && dto.commissionBps !== null)
      return dto.commissionBps / 100;
    return undefined;
  }

  /** Índice por templateKey y por nombre normalizado. */
  private buildIndex<
    T extends { sourceTemplateKey: string | null; name: string },
  >(rows: T[]): ExistingIndex<T> {
    const byTemplateKey = new Map<string, T>();
    const byName = new Map<string, T>();
    for (const row of rows) {
      if (row.sourceTemplateKey) byTemplateKey.set(row.sourceTemplateKey, row);
      const key = normalizeName(row.name);
      if (key && !byName.has(key)) byName.set(key, row);
    }
    return { byTemplateKey, byName };
  }

  private lookup<T>(
    index: ExistingIndex<T>,
    templateKey: string | undefined,
    name: string,
  ): T | undefined {
    if (templateKey) {
      const byKey = index.byTemplateKey.get(templateKey);
      if (byKey) return byKey;
    }
    return index.byName.get(normalizeName(name));
  }

  private track<T extends { name: string }>(
    index: ExistingIndex<T>,
    templateKey: string | undefined,
    row: T,
  ): void {
    if (templateKey) index.byTemplateKey.set(templateKey, row);
    const key = normalizeName(row.name);
    if (key) index.byName.set(key, row);
  }

  /**
   * Valida de una sola vez todos los workerIds del payload. Si alguno no es de
   * la company o no está activo, se aborta la confirmación completa (la
   * transacción no llega a escribir nada).
   */
  private async assertWorkersBelongToCompany(
    em: EntityManager,
    companyId: number,
    dto: ConfirmServicesDto,
  ): Promise<void> {
    const ids = [
      ...new Set(
        dto.categories.flatMap((c) =>
          (c.services || []).flatMap((s) => s.workerIds || []),
        ),
      ),
    ];
    if (ids.length === 0) return;

    const valid = await em.find(CompanyWorker, {
      where: {
        id: In(ids),
        companyId,
        isActive: 1,
        temporarilyDeleted: false,
        permanentlyDeleted: false,
      },
      select: ['id'],
    });
    const validIds = new Set(valid.map((cw) => cw.id));
    const invalid = ids.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Los siguientes trabajadores no pertenecen a tu compañía o no están activos: ${invalid.join(', ')}`,
      );
    }
  }

  /** Get-or-create de la categoría. Si ya existe, se actualiza. */
  private async upsertCategory(
    em: EntityManager,
    companyId: number,
    dto: ConfirmCategoryDto,
    index: ExistingIndex<ServiceCategory>,
  ): Promise<{ category: ServiceCategory; created: boolean }> {
    const existing = this.lookup(index, dto.templateKey, dto.name);

    if (existing) {
      existing.name = dto.name;
      if (dto.description !== undefined)
        existing.description = dto.description ?? (null as unknown as string);
      // Se adopta la plantilla si la categoría venía de una carga manual.
      if (!existing.sourceTemplateKey && dto.templateKey)
        existing.sourceTemplateKey = dto.templateKey;
      const saved = await em.save(ServiceCategory, existing);
      this.track(index, dto.templateKey, saved);
      return { category: saved, created: false };
    }

    const created = em.create(ServiceCategory, {
      companyId,
      name: dto.name,
      description: dto.description ?? (null as unknown as string),
      isActive: true,
      sourceTemplateKey: dto.templateKey ?? null,
    });
    const saved = await em.save(ServiceCategory, created);
    this.track(index, dto.templateKey, saved);
    return { category: saved, created: true };
  }

  /** Get-or-create del servicio. Si ya existe, se actualiza (no se duplica). */
  private async upsertService(
    em: EntityManager,
    companyId: number,
    categoryId: number,
    dto: ConfirmServiceDto,
    index: ExistingIndex<Service>,
  ): Promise<{ created: boolean }> {
    const cost = this.resolveCost(dto);
    const percentage = this.resolvePercentage(dto);

    // Sin porcentaje definido no se fija uno por trabajador: así el trabajador
    // hereda el del servicio cuando el dueño lo complete (un 0 explícito sí
    // ganaría y dejaría al trabajador en 0% para siempre).
    const workers =
      dto.workerIds === undefined
        ? undefined
        : (dto.workerIds.map((id) =>
            percentage === undefined ? { id } : { id, percentage },
          ) as Service['workers']);

    const existing = this.lookup(index, dto.templateKey, dto.name);

    if (existing) {
      existing.name = dto.name;
      existing.categoryId = categoryId;
      if (dto.description !== undefined)
        existing.description = dto.description ?? (null as unknown as string);
      // null/omitido = "sigue pendiente", NO "bórralo": un reenvío para corregir
      // un precio no puede vaciar los que ya estaban puestos.
      if (cost !== undefined) existing.cost = cost;
      if (percentage !== undefined) existing.percentage = percentage;
      if (dto.standardTime !== undefined && dto.standardTime !== null)
        existing.standardTime = dto.standardTime;
      if (dto.currency) existing.currency = dto.currency;
      if (workers !== undefined) existing.workers = workers;
      if (!existing.sourceTemplateKey && dto.templateKey)
        existing.sourceTemplateKey = dto.templateKey;

      const saved = await em.save(Service, existing);
      this.track(index, dto.templateKey, saved);
      return { created: false };
    }

    const created = em.create(Service, {
      companyId,
      categoryId,
      name: dto.name,
      description: dto.description ?? (null as unknown as string),
      cost: cost ?? (null as unknown as number),
      percentage: percentage ?? (null as unknown as number),
      standardTime: dto.standardTime ?? (null as unknown as number),
      ...(dto.currency ? { currency: dto.currency } : {}),
      workers: workers ?? [],
      status: ServiceStatus.ACTIVE,
      forCommunity: false,
      sourceTemplateKey: dto.templateKey ?? null,
    });
    const saved = await em.save(Service, created);
    this.track(index, dto.templateKey, saved);
    return { created: true };
  }

  /**
   * ONB-3 ("desde cero"): el dueño rechaza las plantillas y va a cargar sus
   * servicios a mano, pero el formulario de servicios exige elegir una
   * categoría. Si la company todavía no tiene NINGUNA se le deja creada
   * `Servicio General` para que no quede sin salida.
   *
   * Idempotente: si ya existe cualquier categoría (aunque sea inactiva, o con
   * otro nombre) no se crea nada y se devuelve esa. El `FOR UPDATE` bloquea el
   * hueco del índice por company_id: dos clicks simultáneos no crean dos.
   *
   * NO toca el paso `confirm_services`: una categoría vacía no es un servicio,
   * y ese paso se mide sobre los servicios activos del tenant.
   */
  async ensureDefaultCategory(
    companyId: number,
  ): Promise<DefaultCategoryResponse> {
    return this.dataSource.transaction(async (em) => {
      const existing = await em
        .getRepository(ServiceCategory)
        .createQueryBuilder('category')
        .setLock('pessimistic_write')
        .where('category.company_id = :companyId', { companyId })
        .orderBy('category.id', 'ASC')
        .limit(1)
        .getOne();

      if (existing) {
        return {
          categoryId: existing.id,
          name: existing.name,
          created: false,
        };
      }

      const created = em.create(ServiceCategory, {
        companyId,
        name: DEFAULT_SCRATCH_CATEGORY_NAME,
        description: null as unknown as string,
        isActive: true,
        sourceTemplateKey: null,
      });
      const saved = await em.save(ServiceCategory, created);
      this.logger.log(
        `Onboarding desde cero: categoria por defecto ${saved.id} creada para company ${companyId}`,
      );

      return { categoryId: saved.id, name: saved.name, created: true };
    });
  }

  /** POST /onboarding/services/confirm */
  async confirmServices(
    companyId: number,
    dto: ConfirmServicesDto,
  ): Promise<ConfirmServicesResponse> {
    return this.dataSource.transaction(async (em) => {
      await this.assertWorkersBelongToCompany(em, companyId, dto);

      // Se indexa lo que la company ya tiene (y se va actualizando en memoria),
      // para que dos entradas del mismo payload tampoco se dupliquen entre sí.
      const categoryIndex = this.buildIndex(
        await em.find(ServiceCategory, { where: { companyId } }),
      );
      const serviceIndex = this.buildIndex(
        await em.find(Service, { where: { companyId } }),
      );

      let createdCategories = 0;
      let createdServices = 0;
      let skippedDuplicates = 0;

      for (const cat of dto.categories) {
        // Categoría sin servicios marcados: se ignora (no se crean vacías).
        if (!cat.services || cat.services.length === 0) continue;

        const { category, created } = await this.upsertCategory(
          em,
          companyId,
          cat,
          categoryIndex,
        );
        if (created) createdCategories++;
        else skippedDuplicates++;

        for (const svc of cat.services) {
          const res = await this.upsertService(
            em,
            companyId,
            category.id,
            svc,
            serviceIndex,
          );
          if (res.created) createdServices++;
          else skippedDuplicates++;
        }
      }

      // Los faltantes se cuentan sobre TODOS los servicios activos del tenant,
      // no solo sobre los de este payload.
      const missing = await this.onboardingService.countMissingServices(
        companyId,
        em,
      );
      // Sin servicios activos el paso sigue PENDIENTE (pasa si el payload venía
      // con todas las categorías vacías, que se ignoran).
      const status =
        missing.total === 0
          ? 'pending'
          : missing.prices === 0 && missing.commissions === 0
            ? 'completed'
            : 'incomplete';

      const state = await this.onboardingService.setStep(
        companyId,
        'confirm_services',
        status,
        { prices: missing.prices, commissions: missing.commissions },
        em,
      );
      // Se reporta el estado REAL persistido: ONB-1 no deja retroceder un paso
      // ya completado, así que puede diferir del `status` recién calculado.
      const step = state.steps?.confirm_services ?? { status };

      return {
        createdCategories,
        createdServices,
        skippedDuplicates,
        pending: {
          servicesWithoutPrice: missing.prices,
          servicesWithoutCommission: missing.commissions,
        },
        onboardingStep: {
          key: 'confirm_services',
          status: step.status,
          ...(step.status === 'incomplete'
            ? {
                missing: {
                  prices: missing.prices,
                  commissions: missing.commissions,
                },
              }
            : {}),
        },
      };
    });
  }
}
