import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Company } from '../company/entities/company.entity';
import {
  GRACE_DAYS,
  getPlan,
  type PlanId,
  type PlanLimits,
} from './config/plans.config';
import { Subscription } from './entities/subscription.entity';
import { PaymentReport } from './entities/payment-report.entity';
import { resolveAccess, type AccessState } from './entitlements.util';
import type { AccessResponse } from './dto/access-response.dto';

/**
 * Funciones de sí/no que dependen del PLAN (SUB-1). Son las llaves booleanas de
 * `PlanLimits`; `maxWorkers` queda fuera porque no es sí/no, es cuántos.
 */
export type PlanFeature = Exclude<keyof PlanLimits, 'maxWorkers'>;

export const PLAN_FEATURES: PlanFeature[] = [
  'payroll',
  'analytics',
  'aiSuggestions',
  'workerApp',
  'clientApp',
  'prioritySupport',
];

export function isPlanFeature(value: unknown): value is PlanFeature {
  return (
    typeof value === 'string' && (PLAN_FEATURES as string[]).includes(value)
  );
}

/** Plan vigente + estado de acceso, resueltos de una sola pasada. */
interface EntitlementContext {
  planId: PlanId;
  access: AccessState;
}

/**
 * La ÚNICA puerta de acceso del sistema (SUB-5 / CLYP-338).
 *
 * Combina los dos ejes que el ticket separa:
 *   1. ¿el PLAN incluye la función? — depende de qué compró.
 *   2. ¿el ESTADO de pago le permite operar ahora? — depende de si está al día.
 *
 * Ambos tienen que dar verde. Ningún otro módulo debe mirar `plan_id` ni
 * `subscription.status` por su cuenta: si la regla vive en dos sitios, tarde o
 * temprano se contradicen.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(PaymentReport)
    private readonly reports: Repository<PaymentReport>,
    @InjectRepository(CompanyWorker)
    private readonly workers: Repository<CompanyWorker>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly config: ConfigService,
  ) {}

  /** Ventana de gracia en días. Configurable, 5 por defecto. */
  get graceDays(): number {
    const raw = Number(this.config.get<string>('SUBSCRIPTION_GRACE_DAYS'));
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : GRACE_DAYS;
  }

  /** Company del admin dueño (mismo criterio que el resto del API). */
  async resolveCompanyIdForAdmin(adminUserId: number): Promise<number> {
    const company = await this.companies.findOne({
      where: { userId: adminUserId },
      select: { id: true },
    });
    if (!company)
      throw new ForbiddenException('No tienes una compañía asignada');
    return company.id;
  }

  // ---------------------------------------------------------------------------
  // Estado de acceso
  // ---------------------------------------------------------------------------

  /**
   * Plan y estado efectivo del tenant.
   *
   * El estado se RECALCULA con las fechas y el pago pendiente en vez de confiar
   * en la columna `status`: esa es una caché que escribe el cron, y el acceso no
   * puede depender de que un job haya corrido a tiempo.
   */
  private async context(companyId: number): Promise<EntitlementContext> {
    const subscription = await this.subscriptions.findOne({
      where: { companyId },
    });
    const hasPendingReport = await this.hasPendingReport(companyId);

    return {
      planId: subscription?.planId ?? 'basico',
      access: resolveAccess({
        subscription,
        hasPendingReport,
        graceDays: this.graceDays,
      }),
    };
  }

  /** Estado de acceso efectivo (la matriz del ticket). */
  async getAccessState(companyId: number): Promise<AccessState> {
    return (await this.context(companyId)).access;
  }

  /** ¿Hay un pago reportado esperando verificación? */
  async hasPendingReport(companyId: number): Promise<boolean> {
    const pending = await this.reports.countBy({
      companyId,
      status: 'reported',
    });
    return pending > 0;
  }

  // ---------------------------------------------------------------------------
  // La pregunta central
  // ---------------------------------------------------------------------------

  /**
   * ¿Puede este tenant usar esta función AHORA?
   *
   * Un Básico al día no ve la IA (falla el eje del plan); un Full bloqueado
   * tampoco (falla el eje del estado).
   */
  async can(companyId: number, feature: PlanFeature): Promise<boolean> {
    const { planId, access } = await this.context(companyId);
    return access.canOperate && getPlan(planId).limits[feature];
  }

  /** ¿Puede ejecutar acciones de operación (crear cita, cobrar, etc.)? */
  async canOperate(companyId: number): Promise<boolean> {
    return (await this.context(companyId)).access.canOperate;
  }

  // ---------------------------------------------------------------------------
  // Guardas para el resto del sistema
  // ---------------------------------------------------------------------------

  /**
   * Corta la acción si el tenant está bloqueado. El cuerpo del error lleva
   * `reason: 'subscription_blocked'` para que el front lo mande a la pantalla de
   * pago (SUB-12) en vez de mostrar un error genérico.
   */
  async assertCanOperate(companyId: number): Promise<EntitlementContext> {
    const context = await this.context(companyId);
    if (!context.access.canOperate) {
      throw new ForbiddenException({
        message:
          'Tu suscripción está vencida. Reporta tu pago para reactivar el acceso.',
        reason: 'subscription_blocked',
        status: context.access.status,
        accessEndsAt: context.access.accessEndsAt,
      });
    }
    return context;
  }

  /**
   * Corta la acción si el plan no incluye la función. NO bloquea la app: el
   * error es una invitación a subir de plan, que es un problema distinto a estar
   * moroso.
   */
  async assertCanUseFeature(
    companyId: number,
    feature: PlanFeature,
  ): Promise<void> {
    const { planId } = await this.assertCanOperate(companyId);
    const plan = getPlan(planId);
    if (!plan.limits[feature]) {
      throw new ForbiddenException({
        message: `Tu plan ${plan.name} no incluye esta función. Sube al plan Full para activarla.`,
        reason: 'plan_upgrade_required',
        feature,
        planId,
      });
    }
  }

  /**
   * Tope de trabajadores del plan (SUB-1: Básico 2, Full 20).
   *
   * Se evalúa al CREAR: los trabajadores que ya existen no se tocan si un Full
   * baja a Básico — bajar de plan no destruye datos, solo impide crecer.
   */
  async assertCanAddWorker(companyId: number): Promise<void> {
    const { planId } = await this.assertCanOperate(companyId);
    const plan = getPlan(planId);
    const current = await this.workers.countBy({ companyId, isActive: 1 });

    if (current >= plan.limits.maxWorkers) {
      throw new ForbiddenException({
        message: `Tu plan ${plan.name} permite hasta ${plan.limits.maxWorkers} trabajadores. Sube a Full para agregar más.`,
        reason: 'plan_limit_reached',
        feature: 'maxWorkers',
        planId,
        limit: plan.limits.maxWorkers,
        current,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Lectura para el frontend
  // ---------------------------------------------------------------------------

  /**
   * Todo lo que el panel del dueño necesita para pintarse: qué puede hacer, qué
   * está bloqueado por plan (para el CTA de upgrade) y cuánto le queda.
   */
  async getAccessResponse(companyId: number): Promise<AccessResponse> {
    const { planId, access } = await this.context(companyId);
    const plan = getPlan(planId);
    const workersInUse = await this.workers.countBy({
      companyId,
      isActive: 1,
    });

    const features = PLAN_FEATURES.reduce(
      (acc, feature) => {
        // El eje del plan sigue aplicando dentro de los estados con acceso.
        acc[feature] = access.canOperate && plan.limits[feature];
        return acc;
      },
      {} as Record<PlanFeature, boolean>,
    );

    return {
      planId,
      planName: plan.name,
      status: access.status,
      canOperate: access.canOperate,
      graceCause: access.graceCause,
      accessEndsAt: access.accessEndsAt?.toISOString() ?? null,
      graceEndsAt: access.graceEndsAt?.toISOString() ?? null,
      hasPendingReport: access.graceCause === 'pending_report',
      features,
      limits: {
        maxWorkers: plan.limits.maxWorkers,
        workersInUse,
        canAddWorker:
          access.canOperate && workersInUse < plan.limits.maxWorkers,
      },
    };
  }

  /**
   * Lo que la app del cliente final necesita saber del SALÓN: hoy, si mostrar la
   * sugerencia con IA. En un salón Básico la app simplemente no la pinta — sin
   * candado ni "disponible pronto", para no ensuciarle la experiencia a alguien
   * que no decide el plan.
   */
  async getPublicFeatures(companyId: number): Promise<{
    companyId: number;
    aiSuggestions: boolean;
    clientApp: boolean;
  }> {
    const { planId, access } = await this.context(companyId);
    const plan = getPlan(planId);
    return {
      companyId,
      aiSuggestions: access.canOperate && plan.limits.aiSuggestions,
      clientApp: access.canOperate && plan.limits.clientApp,
    };
  }
}
