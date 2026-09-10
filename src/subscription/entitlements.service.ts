import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Company } from '../company/entities/company.entity';
import {
  GRACE_DAYS,
  TRIAL_DAYS,
  getPlan,
  type PlanId,
  type PlanLimits,
} from './config/plans.config';
import { Subscription } from './entities/subscription.entity';
import { PaymentReport } from './entities/payment-report.entity';
import {
  effectiveLimits,
  effectivePlanId,
  resolveAccess,
  trialStillRunning,
  type AccessState,
} from './entitlements.util';
import type {
  AccessResponse,
  SubscriptionStatusResponse,
} from './dto/access-response.dto';
import type { TenantRole } from '../auth/types/authenticated-request';
import { SubscriptionService } from './subscription.service';

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

/** Plan vigente + estado de acceso + límites, resueltos de una sola pasada. */
interface EntitlementContext {
  /**
   * El plan que el tenant USA ahora. En la prueba es el Full aunque no haya
   * elegido nada; fuera de ella, el que compró. El plan GUARDADO no se toca:
   * eso es lo que se le cotiza cuando la prueba termina.
   */
  planId: PlanId;
  access: AccessState;
  /**
   * Lo que puede usar AHORA. Normalmente son los límites de su plan, pero en
   * `trialing` están todos abiertos y sin tope: la prueba enseña el producto
   * entero aunque el tenant todavía no haya elegido plan.
   */
  limits: PlanLimits;
  /** No se le cobra: el front debe esconderle la pantalla de pago. */
  billingExempt: boolean;
  /**
   * Alguna vez pagó. Distingue "se te acabó la prueba" de "se te venció el mes":
   * son dos situaciones distintas y merecen dos mensajes distintos.
   */
  everPaid: boolean;
  /**
   * El plan que COMPRÓ, tal cual está guardado (null = todavía no eligió).
   *
   * Va aparte de `planId` porque no son lo mismo mientras corre la prueba:
   * pagar el Básico el día 1 deja `planId` en Full —es lo que está usando— y
   * esto en Básico. Sin los dos, la pantalla le dice "Full" a quien pagó $15.
   */
  purchasedPlanId: PlanId | null;
  /** La prueba todavía corre, haya pagado o no. */
  onTrial: boolean;
  trialEndsAt: Date | null;
  /**
   * Tiene un pago esperando verificación, SIN importar de dónde venga su
   * acceso.
   *
   * No es lo mismo que `graceCause === 'pending_report'`: eso solo es cierto
   * cuando ese pago es lo ÚNICO que lo mantiene adentro. Quien paga estando en
   * prueba o al día tiene su pago esperando igual, y la pantalla necesita
   * saberlo para decir "validando tu pago" en vez de pedirle que pague otra vez.
   */
  hasPendingReport: boolean;
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
    private readonly trials: SubscriptionService,
  ) {}

  private readonly logger = new Logger(EntitlementsService.name);

  /** Ventana de gracia en días. Configurable, 5 por defecto. */
  get graceDays(): number {
    const raw = Number(this.config.get<string>('SUBSCRIPTION_GRACE_DAYS'));
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : GRACE_DAYS;
  }

  /**
   * Caché muy corta del contexto, por company (SUB-12).
   *
   * Sin ella, cada endpoint marcado paga 2-4 consultas EXTRA solo para volver a
   * preguntar lo mismo: una pantalla que hace 6 llamadas repetía el cálculo 6
   * veces. Con TTL de segundos —y no de minutos— un pago recién verificado abre
   * el salón casi al instante aunque nadie invalide nada; `invalidate()` lo
   * hace inmediato en los puntos que sí lo saben (verificar, rechazar,
   * reportar).
   *
   * Es por proceso: con varias instancias cada una tiene la suya, y con un TTL
   * así de corto eso no genera contradicciones que duren.
   */
  private readonly cache = new Map<
    number,
    { expiresAt: number; context: EntitlementContext }
  >();

  /** Vida de la caché en milisegundos. 0 la apaga. */
  get cacheTtlMs(): number {
    const raw = Number(this.config.get<string>('SUBSCRIPTION_ACCESS_CACHE_MS'));
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 10_000;
  }

  /**
   * Olvida lo cacheado de un tenant. Se llama donde el acceso CAMBIA (verificar
   * o rechazar un pago, reportar uno nuevo) para que el efecto sea inmediato y
   * no dependa del TTL.
   */
  invalidate(companyId: number): void {
    this.cache.delete(companyId);
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
    const ttl = this.cacheTtlMs;
    if (ttl > 0) {
      const hit = this.cache.get(companyId);
      // El estado se recalcula con la hora de AHORA, así que una entrada vieja
      // no solo ahorra consultas: también congela el borde de un vencimiento.
      // De ahí que el TTL sea de segundos y no de minutos.
      if (hit && hit.expiresAt > Date.now()) return hit.context;
    }

    const context = await this.computeContext(companyId);
    if (ttl > 0)
      this.cache.set(companyId, { expiresAt: Date.now() + ttl, context });
    return context;
  }

  private async computeContext(companyId: number): Promise<EntitlementContext> {
    const subscription = await this.loadSubscription(companyId);
    const hasPendingReport = await this.hasPendingReport(companyId);

    const storedPlanId = subscription?.planId ?? 'basico';
    // Un solo instante para todo el cálculo: el estado y el plan vigente no
    // pueden leerse en dos "ahora" distintos y contradecirse en el borde.
    const now = new Date();
    const trialEndsAt = subscription?.trialEndsAt ?? null;
    const access = resolveAccess({
      subscription,
      hasPendingReport,
      graceDays: this.graceDays,
      now,
    });

    return {
      planId: effectivePlanId(storedPlanId, access.status, trialEndsAt, now),
      access,
      limits: effectiveLimits(storedPlanId, access.status, trialEndsAt, now),
      billingExempt: Boolean(subscription?.billingExempt),
      everPaid: subscription?.currentPeriodEnd != null,
      purchasedPlanId: subscription?.planId ?? null,
      onTrial: trialStillRunning(trialEndsAt, now),
      trialEndsAt,
      hasPendingReport,
    };
  }

  /**
   * La suscripción del tenant, abriéndole la prueba si todavía no tiene una.
   *
   * Red de seguridad de CLYP-332: el alta vive en el registro, y si ese paso
   * falló la company quedaba SIN fila. Sin fila, `resolveAccess` concede acceso
   * completo y sin fecha de fin: gratis para siempre, en silencio. Aquí se
   * repara la primera vez que alguien pregunta por el acceso.
   *
   * Es idempotente (lo garantiza `startTrial` con el único de company_id), así
   * que dos peticiones a la vez no abren dos pruebas.
   *
   * Si la creación falla —base caída, company borrada— NO se rompe la lectura:
   * se sigue con `null`, el comportamiento permisivo de siempre. Dejar al dueño
   * sin entrar por no poder abrirle una prueba sería peor que abrirla tarde.
   */
  private async loadSubscription(
    companyId: number,
  ): Promise<Subscription | null> {
    const existing = await this.subscriptions.findOne({ where: { companyId } });
    if (existing) return existing;

    try {
      const created = await this.trials.ensureSubscription(companyId);
      this.logger.warn(
        `La company ${companyId} no tenía suscripción: se le abrió la prueba ahora.`,
      );
      return created;
    } catch (error) {
      this.logger.error(
        `No se pudo abrir la prueba de la company ${companyId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  /** Estado de acceso efectivo (la matriz del ticket). */
  async getAccessState(companyId: number): Promise<AccessState> {
    return (await this.context(companyId)).access;
  }

  /**
   * ¿Hay un pago reportado esperando verificación?
   *
   * Un pago que la PASARELA rechazó ya no cuenta: seguía concediendo acceso a
   * quien no pagó, y encima le tapaba los avisos de cobro. Los que están en
   * `pending` o `expired` sí cuentan —ahí el que todavía no respondió es
   * nuestro conciliador, y esa demora no la paga el dueño—.
   *
   * El `null` se escribe aparte porque en SQL `NULL <> 'rejected'` no es cierto:
   * sin esta rama los reportes manuales, que no pasan por la pasarela, dejarían
   * de conceder acceso.
   */
  async hasPendingReport(companyId: number): Promise<boolean> {
    const pending = await this.reports.countBy([
      { companyId, status: 'reported', autoCheckStatus: IsNull() },
      { companyId, status: 'reported', autoCheckStatus: Not('rejected') },
    ]);
    return pending > 0;
  }

  // ---------------------------------------------------------------------------
  // La pregunta central
  // ---------------------------------------------------------------------------

  /**
   * ¿Puede este tenant usar esta función AHORA?
   *
   * Un Básico al día no ve la IA (falla el eje del plan); un Full bloqueado
   * tampoco (falla el eje del estado). En prueba pasan todas: esos 15 días
   * enseñan el producto entero.
   */
  async can(companyId: number, feature: PlanFeature): Promise<boolean> {
    const { access, limits } = await this.context(companyId);
    return access.canOperate && limits[feature];
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
  async assertCanOperate(
    companyId: number,
    role: TenantRole = 'adm',
  ): Promise<EntitlementContext> {
    const context = await this.context(companyId);
    if (!context.access.canOperate) {
      throw new ForbiddenException(this.blockedBody(context, role));
    }
    return context;
  }

  /**
   * El cuerpo del 403 según QUIÉN se topó con el bloqueo (SUB-12).
   *
   * Al dueño se le habla de su suscripción: es su cuenta y el único que puede
   * pagarla. Al trabajador NO: la deuda no es suya, no tiene con qué
   * resolverla, y mandarlo a una pantalla de pago solo lo deja mirando un botón
   * que no le sirve. Por eso su cuerpo va sin `trialExpired`, sin estado y sin
   * fechas: son datos de facturación del salón donde trabaja.
   *
   * `blockedFor` es lo que el front mira para elegir pantalla.
   */
  private blockedBody(
    context: EntitlementContext,
    role: TenantRole,
  ): Record<string, unknown> {
    if (role === 'wrk') {
      return {
        message:
          'El salón no tiene el acceso activo en este momento. Comunícate con el administrador del salón para reactivarlo.',
        reason: 'subscription_blocked',
        blockedFor: 'wrk',
      };
    }

    // Dos situaciones distintas, dos mensajes distintos. A quien se le acabó
    // la prueba nunca tuvo una suscripción que "venciera", y decirle que
    // "reactive" algo que jamás activó lo deja buscando un botón que no hay.
    return {
      message: context.everPaid
        ? 'Tu suscripción venció. Reporta tu pago para reactivar el acceso.'
        : `Se acabaron tus ${TRIAL_DAYS} días de prueba. Elige tu plan y reporta tu pago para seguir usando Clyps.`,
      reason: 'subscription_blocked',
      blockedFor: 'adm',
      // El front lo usa para llevarlo a elegir plan o a renovar, que son dos
      // pantallas distintas.
      trialExpired: !context.everPaid,
      status: context.access.status,
      accessEndsAt: context.access.accessEndsAt,
    };
  }

  /**
   * Corta la acción si el plan no incluye la función. NO bloquea la app: el
   * error es una invitación a subir de plan, que es un problema distinto a estar
   * moroso.
   */
  async assertCanUseFeature(
    companyId: number,
    feature: PlanFeature,
    role: TenantRole = 'adm',
  ): Promise<void> {
    const { planId, limits } = await this.assertCanOperate(companyId, role);
    const plan = getPlan(planId);
    if (!limits[feature]) {
      throw new ForbiddenException({
        message: `Tu plan ${plan.name} no incluye esta función. Sube al plan Full para activarla.`,
        reason: 'plan_upgrade_required',
        feature,
        planId,
      });
    }
  }

  /**
   * Tope de trabajadores del plan vigente (SUB-1: Básico 2, Full 20; en
   * prueba, el del Full).
   *
   * Se evalúa al CREAR: los trabajadores que ya existen no se tocan si un Full
   * baja a Básico — bajar de plan no destruye datos, solo impide crecer.
   */
  async assertCanAddWorker(companyId: number): Promise<void> {
    const { planId, limits } = await this.assertCanOperate(companyId);
    const max = limits.maxWorkers;
    const plan = getPlan(planId);
    const current = await this.workers.countBy({ companyId, isActive: 1 });

    if (current >= max) {
      throw new ForbiddenException({
        message: `Tu plan ${plan.name} permite hasta ${max} trabajadores. Sube a Full para agregar más.`,
        reason: 'plan_limit_reached',
        feature: 'maxWorkers',
        planId,
        limit: max,
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
    const {
      planId,
      access,
      limits,
      billingExempt,
      purchasedPlanId,
      onTrial,
      trialEndsAt,
      hasPendingReport,
    } = await this.context(companyId);
    const plan = getPlan(planId);
    const workersInUse = await this.workers.countBy({
      companyId,
      isActive: 1,
    });

    const features = PLAN_FEATURES.reduce(
      (acc, feature) => {
        // El eje del plan sigue aplicando dentro de los estados con acceso
        // (salvo en la prueba, donde los límites vienen todos abiertos).
        acc[feature] = access.canOperate && limits[feature];
        return acc;
      },
      {} as Record<PlanFeature, boolean>,
    );

    return {
      planId,
      planName: plan.name,
      purchasedPlanId,
      purchasedPlanName: purchasedPlanId ? getPlan(purchasedPlanId).name : null,
      onTrial,
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      status: access.status,
      canOperate: access.canOperate,
      graceCause: access.graceCause,
      accessEndsAt: access.accessEndsAt?.toISOString() ?? null,
      graceEndsAt: access.graceEndsAt?.toISOString() ?? null,
      hasPendingReport,
      billingExempt,
      features,
      limits: {
        maxWorkers: limits.maxWorkers,
        workersInUse,
        canAddWorker: access.canOperate && workersInUse < limits.maxWorkers,
      },
    };
  }

  /**
   * La foto mínima del acceso para el rol que pregunta (SUB-12).
   *
   * El dueño ya tiene `GET /subscription/access` con todo; esto es para el
   * trabajador, que necesita saber si el salón está bloqueado ANTES de tocar
   * una cita y recibir un 403 seco. Reutiliza `blockedBody` para que el
   * mensaje del cartel y el del error nunca se separen.
   */
  async getStatusResponse(
    companyId: number,
    role: TenantRole,
  ): Promise<SubscriptionStatusResponse> {
    const context = await this.context(companyId);
    if (context.access.canOperate)
      return { canOperate: true, blockedFor: null, message: null };

    const body = this.blockedBody(context, role);
    return {
      canOperate: false,
      blockedFor: body.blockedFor as 'adm' | 'wrk',
      message: body.message as string,
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
    const { access, limits } = await this.context(companyId);
    return {
      companyId,
      aiSuggestions: access.canOperate && limits.aiSuggestions,
      clientApp: access.canOperate && limits.clientApp,
    };
  }
}
