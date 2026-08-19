import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { OnboardingState } from './entities/onboarding_state.entity';
import {
  ONBOARDING_STEP_KEYS,
  buildInitialSteps,
} from './types/onboarding.types';
import type {
  OnboardingStepKey,
  OnboardingStepState,
  OnboardingStepStatus,
  OnboardingSteps,
} from './types/onboarding.types';
import type {
  OnboardingSkipResponse,
  OnboardingStateResponse,
} from './dto/onboarding-state-response.dto';

/** Resultado del recálculo de un paso contra el estado real del sistema. */
interface StepEvaluation {
  status: OnboardingStepStatus;
  missing?: Record<string, number>;
  /** Solo `first_charge`: fecha del primer cobro detectado. */
  firstChargeAt?: Date | null;
}

/** Conteo de servicios activos a los que les falta precio o comisión. */
export interface MissingServiceData {
  total: number;
  prices: number;
  commissions: number;
}

/**
 * ONB-1: estado de onboarding por company (tenant).
 *
 * Regla central: NINGÚN paso se marca por autorreporte. Cada paso se recalcula
 * leyendo el estado real del sistema cuando ocurre su evento disparador (los
 * módulos de Perfil / Equipo / Servicios / Citas / Cobro llaman a
 * `recomputeStep`). No existe endpoint para "marcar paso completado".
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private manager(manager?: EntityManager): EntityManager {
    return manager ?? this.dataSource.manager;
  }

  /** Resuelve la company del admin dueño (mismo criterio que el resto del API). */
  async resolveCompanyIdForAdmin(adminUserId: number): Promise<number> {
    const rows: Array<{ id: number }> = await this.dataSource.query(
      'SELECT id FROM `company` WHERE user_id = ? LIMIT 1',
      [adminUserId],
    );
    if (!rows.length)
      throw new UnauthorizedException('No tienes una compañía asignada');
    return rows[0].id;
  }

  // ---------------------------------------------------------------------------
  // Lectura / creación del registro
  // ---------------------------------------------------------------------------

  /**
   * Devuelve el registro de la company. Si no existe lo crea y hace un recálculo
   * completo (bootstrap): así una company que ya venía trabajando antes de la
   * feature no aparece con los 5 pasos en `pending`.
   */
  async getOrCreateState(
    companyId: number,
    manager?: EntityManager,
  ): Promise<OnboardingState> {
    const em = this.manager(manager);
    const repo = em.getRepository(OnboardingState);

    const existing = await repo.findOne({ where: { companyId } });
    if (existing) return existing;

    const now = new Date().toISOString();
    const created = repo.create({
      companyId,
      globalStatus: 'in_progress',
      steps: buildInitialSteps(now),
      firstChargeAt: null,
      startedAt: new Date(),
      completedAt: null,
    });
    try {
      await repo.save(created);
    } catch {
      // Carrera entre dos requests simultáneos: el UNIQUE(company_id) protege.
      const raced = await repo.findOne({ where: { companyId } });
      if (raced) return raced;
      throw new Error('No se pudo crear el estado de onboarding');
    }
    return this.recomputeAll(companyId, manager);
  }

  /** GET /onboarding/state */
  async getState(companyId: number): Promise<OnboardingStateResponse> {
    const state = await this.getOrCreateState(companyId);
    return this.toResponse(state);
  }

  toResponse(state: OnboardingState): OnboardingStateResponse {
    const steps = this.normalizeSteps(state.steps);
    return {
      globalStatus: state.globalStatus,
      progress: {
        completed: ONBOARDING_STEP_KEYS.filter(
          (k) => steps[k].status === 'completed',
        ).length,
        total: ONBOARDING_STEP_KEYS.length,
      },
      steps: ONBOARDING_STEP_KEYS.map((key) => ({
        key,
        status: steps[key].status,
        ...(steps[key].status === 'incomplete' && steps[key].missing
          ? { missing: steps[key].missing }
          : {}),
      })),
      firstChargeAt: state.firstChargeAt
        ? new Date(state.firstChargeAt).toISOString()
        : null,
    };
  }

  /** Rellena pasos que falten (p. ej. si se agrega un paso nuevo después). */
  private normalizeSteps(steps: OnboardingSteps | null): OnboardingSteps {
    const now = new Date().toISOString();
    const base = buildInitialSteps(now);
    if (!steps) return base;
    for (const key of ONBOARDING_STEP_KEYS) {
      if (steps[key]?.status) base[key] = steps[key];
    }
    return base;
  }

  // ---------------------------------------------------------------------------
  // Recálculo
  // ---------------------------------------------------------------------------

  /**
   * Recalcula UN paso desde el estado real del sistema y persiste si cambió.
   * `updated_at` solo se mueve cuando hay cambio real (ONB-4 mide estancamiento).
   */
  async recomputeStep(
    companyId: number,
    stepKey: OnboardingStepKey,
    manager?: EntityManager,
  ): Promise<OnboardingState> {
    const em = this.manager(manager);
    const evaluation = await this.evaluateStep(companyId, stepKey, em);
    return this.applyEvaluations(companyId, { [stepKey]: evaluation }, em);
  }

  /**
   * Variante para los hooks de otros módulos: nunca propaga el error. Un fallo
   * calculando onboarding no puede tumbar la creación de un trabajador, un
   * servicio o una cita.
   */
  async safeRecomputeStep(
    companyId: number | null | undefined,
    stepKey: OnboardingStepKey,
    manager?: EntityManager,
  ): Promise<void> {
    if (!companyId) return;
    try {
      await this.recomputeStep(companyId, stepKey, manager);
    } catch (error) {
      this.logger.warn(
        `No se pudo recalcular el paso "${stepKey}" de la company ${companyId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** POST /onboarding/recompute — recalcula los 5 pasos. Idempotente. */
  async recomputeAll(
    companyId: number,
    manager?: EntityManager,
  ): Promise<OnboardingState> {
    const em = this.manager(manager);
    const evaluations: Partial<Record<OnboardingStepKey, StepEvaluation>> = {};
    for (const key of ONBOARDING_STEP_KEYS) {
      evaluations[key] = await this.evaluateStep(companyId, key, em);
    }
    return this.applyEvaluations(companyId, evaluations, em);
  }

  /**
   * Fija un paso con un estado ya calculado por el módulo llamante (ONB-3 lo usa
   * dentro de su transacción para no re-consultar). Respeta la regla de no
   * retroceder desde `completed`.
   */
  async setStep(
    companyId: number,
    stepKey: OnboardingStepKey,
    status: OnboardingStepStatus,
    missing?: Record<string, number>,
    manager?: EntityManager,
  ): Promise<OnboardingState> {
    return this.applyEvaluations(
      companyId,
      { [stepKey]: { status, missing } },
      this.manager(manager),
    );
  }

  /**
   * Aplica los cambios de paso y decide el estado global. Solo hace `save` si
   * algo cambió de verdad.
   */
  private async applyEvaluations(
    companyId: number,
    evaluations: Partial<Record<OnboardingStepKey, StepEvaluation>>,
    em: EntityManager,
  ): Promise<OnboardingState> {
    const repo = em.getRepository(OnboardingState);
    let state = await repo.findOne({ where: { companyId } });
    if (!state) {
      const now = new Date().toISOString();
      state = repo.create({
        companyId,
        globalStatus: 'in_progress',
        steps: buildInitialSteps(now),
        firstChargeAt: null,
        startedAt: new Date(),
        completedAt: null,
      });
      await repo.save(state);
    }

    const steps = this.normalizeSteps(state.steps);
    const nowIso = new Date().toISOString();
    let changed = false;

    for (const [rawKey, evaluation] of Object.entries(evaluations)) {
      const key = rawKey as OnboardingStepKey;
      if (!evaluation) continue;
      const current = steps[key];

      // Un paso NUNCA retrocede desde `completed` (borrar el único trabajador no
      // debe castigar al dueño). Sí puede avanzar pending → incomplete → completed.
      if (current.status === 'completed') continue;

      const next: OnboardingStepState = {
        status: evaluation.status,
        updatedAt: nowIso,
        ...(evaluation.status === 'incomplete' && evaluation.missing
          ? { missing: evaluation.missing }
          : {}),
      };
      if (this.sameStep(current, next)) continue;

      steps[key] = next;
      changed = true;

      // El "ajá": se sella la primera vez y no se vuelve a tocar.
      if (
        key === 'first_charge' &&
        evaluation.status === 'completed' &&
        !state.firstChargeAt
      ) {
        state.firstChargeAt = evaluation.firstChargeAt ?? new Date();
      }
    }

    const allCompleted = ONBOARDING_STEP_KEYS.every(
      (k) => steps[k].status === 'completed',
    );
    if (allCompleted && state.globalStatus !== 'completed') {
      state.globalStatus = 'completed';
      state.completedAt = new Date();
      changed = true;
    }

    if (!changed) return state;

    state.steps = steps;
    await repo.save(state);
    return state;
  }

  /** Dos estados de paso son equivalentes si coinciden status y `missing`. */
  private sameStep(a: OnboardingStepState, b: OnboardingStepState): boolean {
    if (a.status !== b.status) return false;
    return (
      JSON.stringify(a.missing ?? null) === JSON.stringify(b.missing ?? null)
    );
  }

  /** POST /onboarding/skip — "explorar por mi cuenta". No bloquea nada. */
  async skip(companyId: number): Promise<OnboardingSkipResponse> {
    const state = await this.getOrCreateState(companyId);
    if (state.globalStatus !== 'skipped') {
      state.globalStatus = 'skipped';
      await this.dataSource.getRepository(OnboardingState).save(state);
    }
    return { globalStatus: 'skipped' };
  }

  // ---------------------------------------------------------------------------
  // Lectura del estado real del sistema (una consulta por paso)
  // ---------------------------------------------------------------------------

  private async evaluateStep(
    companyId: number,
    stepKey: OnboardingStepKey,
    em: EntityManager,
  ): Promise<StepEvaluation> {
    switch (stepKey) {
      case 'create_profile':
        return this.evaluateCreateProfile(companyId, em);
      case 'add_team':
        return this.evaluateAddTeam(companyId, em);
      case 'confirm_services':
        return this.evaluateConfirmServices(companyId, em);
      case 'first_appointment':
        return this.evaluateFirstAppointment(companyId, em);
      case 'first_charge':
        return this.evaluateFirstCharge(companyId, em);
    }
  }

  /** Perfil con los datos mínimos: nombre + al menos un tipo de negocio. */
  private async evaluateCreateProfile(
    companyId: number,
    em: EntityManager,
  ): Promise<StepEvaluation> {
    const rows: Array<{ hasName: number; categories: number }> = await em.query(
      `SELECT
         (c.name IS NOT NULL AND TRIM(c.name) <> '') AS hasName,
         (SELECT COUNT(*) FROM company_category cc WHERE cc.company_id = c.id) AS categories
       FROM company c
      WHERE c.id = ?`,
      [companyId],
    );
    const row = rows[0];
    const ok = !!row && Number(row.hasName) === 1 && Number(row.categories) > 0;
    return { status: ok ? 'completed' : 'pending' };
  }

  /** Equipo: al menos un trabajador activo y no eliminado. */
  private async evaluateAddTeam(
    companyId: number,
    em: EntityManager,
  ): Promise<StepEvaluation> {
    const rows: Array<{ total: number }> = await em.query(
      `SELECT COUNT(*) AS total
         FROM company_worker
        WHERE company_id = ?
          AND is_active = 1
          AND COALESCE(temporarily_deleted, 0) = 0
          AND COALESCE(permanently_deleted, 0) = 0`,
      [companyId],
    );
    return {
      status: Number(rows[0]?.total ?? 0) > 0 ? 'completed' : 'pending',
    };
  }

  /**
   * Servicios: completo solo si TODOS los activos tienen precio y comisión. Si
   * hay servicios pero falta alguno → incompleto con el conteo. Sin servicios
   * todavía → pendiente.
   */
  private async evaluateConfirmServices(
    companyId: number,
    em: EntityManager,
  ): Promise<StepEvaluation> {
    const missing = await this.countMissingServices(companyId, em);
    if (missing.total === 0) return { status: 'pending' };
    if (missing.prices === 0 && missing.commissions === 0)
      return { status: 'completed' };
    return {
      status: 'incomplete',
      missing: { prices: missing.prices, commissions: missing.commissions },
    };
  }

  /**
   * Conteo de servicios activos sin precio / sin comisión. Lo reutiliza ONB-3 al
   * confirmar plantillas.
   */
  async countMissingServices(
    companyId: number,
    manager?: EntityManager,
  ): Promise<MissingServiceData> {
    const em = this.manager(manager);
    const rows: Array<{ total: number; prices: number; commissions: number }> =
      await em.query(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN s.cost IS NULL OR s.cost <= 0 THEN 1 ELSE 0 END) AS prices,
           SUM(CASE WHEN s.percentage IS NULL THEN 1 ELSE 0 END) AS commissions
         FROM service s
        WHERE s.company_id = ?
          AND COALESCE(s.status, 1) = 1`,
        [companyId],
      );
    const row = rows[0];
    return {
      total: Number(row?.total ?? 0),
      prices: Number(row?.prices ?? 0),
      commissions: Number(row?.commissions ?? 0),
    };
  }

  /** Primera cita: existe al menos una sesión con detalle de esta company. */
  private async evaluateFirstAppointment(
    companyId: number,
    em: EntityManager,
  ): Promise<StepEvaluation> {
    const rows: Array<{ total: number }> = await em.query(
      `SELECT COUNT(DISTINCT sd.session_id) AS total
         FROM session_detail sd
         JOIN company_worker cw ON cw.id = sd.company_worker_id
        WHERE cw.company_id = ?`,
      [companyId],
    );
    return {
      status: Number(rows[0]?.total ?? 0) > 0 ? 'completed' : 'pending',
    };
  }

  /** Primer cobro (el "ajá"): existe un `session_payments` de esta company. */
  private async evaluateFirstCharge(
    companyId: number,
    em: EntityManager,
  ): Promise<StepEvaluation> {
    const rows: Array<{ firstChargeAt: Date | string | null }> = await em.query(
      `SELECT MIN(COALESCE(sp.collected_at, sp.paid_at, sp.created_at)) AS firstChargeAt
         FROM session_payments sp
        WHERE EXISTS (
          SELECT 1
            FROM session_detail sd
            JOIN company_worker cw ON cw.id = sd.company_worker_id
           WHERE sd.session_id = sp.session_id
             AND cw.company_id = ?
        )`,
      [companyId],
    );
    const first = rows[0]?.firstChargeAt ?? null;
    if (!first) return { status: 'pending' };
    return { status: 'completed', firstChargeAt: new Date(first) };
  }
}
