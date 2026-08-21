import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OnboardingRescueNotification } from '../entities/onboarding_rescue_notification.entity';
import { ONBOARDING_STEP_KEYS } from '../types/onboarding.types';
import type {
  OnboardingStepKey,
  OnboardingSteps,
} from '../types/onboarding.types';
import type {
  RescueLevel,
  RescueThresholds,
  StuckTenant,
} from '../types/rescue.types';
import { EmailService } from '../../email/email.service';
import { NotificationService } from '../../notification/notification.service';
import { buildNavigationData } from '../../notification/entities/notification.entity';
import { buildRescueDigestHtml, STEP_LABELS } from './rescue-digest.template';

/** Fila cruda del barrido, antes de clasificar. */
interface StuckRow {
  companyId: number;
  steps: OnboardingSteps | string | null;
  lastProgressAt: Date;
  startedAt: Date;
  daysStalled: number | string;
  companyName: string | null;
  phone: string | null;
  ownerUserId: number | null;
  ownerEmail: string | null;
}

/** Resultado del barrido, para logs y para probarlo a mano. */
export interface SweepResult {
  scanned: number;
  ownerReminders: number;
  digestTenants: number;
  digestSent: boolean;
  skippedAlreadyNotified: number;
}

/**
 * ONB-4: detección de dueños atascados y rescate.
 *
 * "Atascado" = onboarding `in_progress` + N días sin que NINGÚN paso cambie. Se
 * mide por `onboarding_state.updated_at` (estancamiento), no por antigüedad del
 * registro: alguien puede avanzar 3 pasos y trabarse en el 4º, y lo que importa
 * es el tiempo sin moverse.
 *
 * Un cron diario clasifica por días sin avanzar y escala: recordatorio al dueño
 * → alerta al consultor → en riesgo. El anti-spam vive en
 * `onboarding_rescue_notification`: mientras exista la fila (company, paso,
 * nivel) no se repite el aviso; solo se vuelve a notificar al ESCALAR.
 */
@Injectable()
export class OnboardingRescueService {
  private readonly logger = new Logger(OnboardingRescueService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OnboardingRescueNotification)
    private readonly rescueRepo: Repository<OnboardingRescueNotification>,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly notifications: NotificationService,
  ) {}

  // ---------------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------------

  /** Umbrales en días. Configurables por entorno, nunca hardcodeados. */
  get thresholds(): RescueThresholds {
    const read = (key: string, fallback: number): number => {
      const raw = Number(this.config.get<string>(key));
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
    };
    return {
      reminder: read('ONBOARDING_STUCK_REMINDER_DAYS', 2),
      alert: read('ONBOARDING_STUCK_ALERT_DAYS', 4),
      risk: read('ONBOARDING_STUCK_RISK_DAYS', 7),
    };
  }

  /** Destinatario del digest. Sin esto el cron detecta pero no envía. */
  get consultantEmail(): string | null {
    const value = this.config
      .get<string>('ONBOARDING_CONSULTANT_EMAIL', '')
      ?.trim();
    return value ? value : null;
  }

  // ---------------------------------------------------------------------------
  // Detección
  // ---------------------------------------------------------------------------

  /**
   * Tenants `in_progress` que llevan al menos `minDays` sin cambiar de paso,
   * ya clasificados por nivel y con el paso donde se trabaron.
   */
  async findStuckTenants(minDays?: number): Promise<StuckTenant[]> {
    const t = this.thresholds;
    const floor = minDays ?? Math.min(t.reminder, t.alert, t.risk);

    const rows: StuckRow[] = await this.dataSource.query(
      `SELECT os.company_id                                  AS companyId,
              os.steps                                       AS steps,
              os.updated_at                                  AS lastProgressAt,
              os.started_at                                  AS startedAt,
              TIMESTAMPDIFF(DAY, os.updated_at, NOW())       AS daysStalled,
              co.name                                        AS companyName,
              co.phone                                       AS phone,
              co.user_id                                     AS ownerUserId,
              u.email                                        AS ownerEmail
         FROM onboarding_state os
         JOIN company co ON co.id = os.company_id
         LEFT JOIN user u ON u.id = co.user_id
        WHERE os.global_status = 'in_progress'
          AND os.updated_at <= (NOW() - INTERVAL ? DAY)
        ORDER BY daysStalled DESC, os.company_id ASC`,
      [floor],
    );

    return rows
      .map((row) => this.classify(row, t))
      .filter((x): x is StuckTenant => x !== null);
  }

  /** Traduce una fila cruda a un tenant clasificado. */
  private classify(row: StuckRow, t: RescueThresholds): StuckTenant | null {
    const days = Number(row.daysStalled ?? 0);
    const level = this.levelFor(days, t);
    if (!level) return null;

    const steps = this.parseSteps(row.steps);
    // Donde se trabó = primer paso que todavía no está completo.
    const step: OnboardingStepKey =
      ONBOARDING_STEP_KEYS.find((k) => steps?.[k]?.status !== 'completed') ??
      ONBOARDING_STEP_KEYS[ONBOARDING_STEP_KEYS.length - 1];
    const completedSteps = ONBOARDING_STEP_KEYS.filter(
      (k) => steps?.[k]?.status === 'completed',
    ).length;

    return {
      companyId: row.companyId,
      companyName: row.companyName || `Compañía ${row.companyId}`,
      phone: row.phone || null,
      ownerEmail: row.ownerEmail || null,
      ownerUserId: row.ownerUserId ?? null,
      step,
      daysStalled: days,
      completedSteps,
      level,
      lastProgressAt: new Date(row.lastProgressAt),
      startedAt: new Date(row.startedAt),
    };
  }

  /** El nivel MÁS ALTO que alcanzó, o null si todavía no llega al primero. */
  private levelFor(days: number, t: RescueThresholds): RescueLevel | null {
    if (days >= t.risk) return 'risk';
    if (days >= t.alert) return 'alert';
    if (days >= t.reminder) return 'reminder';
    return null;
  }

  private parseSteps(value: StuckRow['steps']): OnboardingSteps | null {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as OnboardingSteps;
      } catch {
        return null;
      }
    }
    return value;
  }

  // ---------------------------------------------------------------------------
  // Anti-spam
  // ---------------------------------------------------------------------------

  /**
   * Reclama el aviso de forma atómica: INSERT IGNORE contra el UNIQUE
   * (company, paso, nivel). Devuelve true si lo reclamó (→ hay que avisar) o
   * false si ya se había avisado por esa misma combinación.
   */
  private async claim(tenant: StuckTenant, channel: string): Promise<boolean> {
    const result: { affectedRows?: number } = await this.rescueRepo.query(
      `INSERT IGNORE INTO \`onboarding_rescue_notification\`
         (\`company_id\`, \`step\`, \`level\`, \`channel\`, \`days_stalled\`, \`sent_at\`)
       VALUES (?, ?, ?, ?, ?, NOW(6))`,
      [
        tenant.companyId,
        tenant.step,
        tenant.level,
        channel,
        tenant.daysStalled,
      ],
    );
    return (result?.affectedRows ?? 0) > 0;
  }

  /** Suelta el reclamo cuando el envío falló, para reintentar mañana. */
  private async release(tenant: StuckTenant): Promise<void> {
    await this.rescueRepo.delete({
      companyId: tenant.companyId,
      step: tenant.step,
      level: tenant.level,
    });
  }

  // ---------------------------------------------------------------------------
  // Barrido diario
  // ---------------------------------------------------------------------------

  /**
   * 8:00 am hora de Venezuela. Diario alcanza: el onboarding se mide en días,
   * no en minutos, y correrlo más seguido solo genera ruido.
   */
  @Cron('0 8 * * *', { timeZone: 'America/Caracas' })
  async dailySweep(): Promise<SweepResult> {
    const result = await this.runSweep();
    this.logger.log(
      `Rescate: ${result.scanned} atascados · ${result.ownerReminders} recordatorios al dueño · ` +
        `${result.digestTenants} en el digest (enviado: ${result.digestSent}) · ` +
        `${result.skippedAlreadyNotified} omitidos por anti-spam`,
    );
    return result;
  }

  /** El barrido en sí. Separado del cron para poder dispararlo a mano. */
  async runSweep(): Promise<SweepResult> {
    const stuck = await this.findStuckTenants();
    const result: SweepResult = {
      scanned: stuck.length,
      ownerReminders: 0,
      digestTenants: 0,
      digestSent: false,
      skippedAlreadyNotified: 0,
    };

    // Umbral bajo: aviso automático al dueño, sin molestar todavía al consultor.
    for (const tenant of stuck.filter((s) => s.level === 'reminder')) {
      if (!(await this.claim(tenant, 'owner_notification'))) {
        result.skippedAlreadyNotified++;
        continue;
      }
      const sent = await this.remindOwner(tenant);
      if (sent) result.ownerReminders++;
      else await this.release(tenant);
    }

    // Umbrales altos: un solo correo-digest agrupado, no uno por dueño.
    const forDigest: StuckTenant[] = [];
    for (const tenant of stuck.filter((s) => s.level !== 'reminder')) {
      if (!(await this.claim(tenant, 'consultant_digest'))) {
        result.skippedAlreadyNotified++;
        continue;
      }
      forDigest.push(tenant);
    }
    result.digestTenants = forDigest.length;

    if (forDigest.length > 0) {
      result.digestSent = await this.sendDigest(forDigest);
      // Si el correo no salió se sueltan los reclamos y mañana se reintenta.
      if (!result.digestSent) {
        for (const tenant of forDigest) await this.release(tenant);
      }
    }

    return result;
  }

  /**
   * Recordatorio al dueño por la capa de notificación agnóstica al canal
   * (feed in-app + push FCM). Cuando exista WhatsApp se enchufa ahí sin tocar
   * este cron.
   */
  private async remindOwner(tenant: StuckTenant): Promise<boolean> {
    if (!tenant.ownerUserId) {
      this.logger.warn(
        `Company ${tenant.companyId} sin usuario dueño: no se puede recordar`,
      );
      return false;
    }
    try {
      await this.notifications.createNotification(tenant.ownerUserId, {
        type: 'reminder',
        title: 'Te falta poco para terminar tu configuración',
        body: `Sigue pendiente: ${STEP_LABELS[tenant.step]}. Termínalo y empieza a cobrar con CLYPS.`,
        // `type: 'reminder'` lo comparten los recordatorios de cita, así que se
        // marca el origen y el paso: con eso el front distingue el aviso y sabe
        // a qué pantalla del checklist llevar al dueño.
        data: {
          ...buildNavigationData('reminder', undefined, tenant.companyId),
          onboarding: true,
          step: tenant.step,
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `No se pudo recordar a la company ${tenant.companyId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * UN correo diario al consultor con todos los rescates, agrupados por urgencia
   * (7+ días primero) y por paso. Un correo por dueño se ignora; uno accionable
   * ("hoy tienes 6 rescates") se lee.
   */
  private async sendDigest(tenants: StuckTenant[]): Promise<boolean> {
    const to = this.consultantEmail;
    if (!to) {
      this.logger.warn(
        `ONBOARDING_CONSULTANT_EMAIL sin configurar: ${tenants.length} rescate(s) detectados pero no se envió el digest`,
      );
      return false;
    }

    const risk = tenants.filter((t) => t.level === 'risk').length;
    const subject =
      risk > 0
        ? `Rescate de onboarding: ${tenants.length} negocio(s), ${risk} en riesgo`
        : `Rescate de onboarding: ${tenants.length} negocio(s)`;

    return this.email.sendEmail(
      to,
      subject,
      buildRescueDigestHtml(tenants, this.thresholds),
    );
  }

  // ---------------------------------------------------------------------------
  // Cola de rescate (base del panel interno)
  // ---------------------------------------------------------------------------

  /**
   * Lo mismo que ve el consultor en el digest, pero consultable en cualquier
   * momento. Es la base del panel interno que reemplazará al correo.
   */
  async getRescueQueue(): Promise<{
    thresholds: RescueThresholds;
    total: number;
    risk: StuckTenant[];
    alert: StuckTenant[];
    reminder: StuckTenant[];
  }> {
    const stuck = await this.findStuckTenants();
    return {
      thresholds: this.thresholds,
      total: stuck.length,
      risk: stuck.filter((t) => t.level === 'risk'),
      alert: stuck.filter((t) => t.level === 'alert'),
      reminder: stuck.filter((t) => t.level === 'reminder'),
    };
  }
}
