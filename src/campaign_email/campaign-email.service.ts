import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { EmailService } from '../email/email.service';
import { PAY_URL } from '../subscription/config/app-links.config';
import { PromoService } from '../subscription/promo.service';
import {
  CAMPAIGN_IDS,
  buildCampaignEmail,
  campaignSubjectSample,
  type CampaignId,
} from './campaign-email.template';
import {
  CAMPAIGN_SCHEDULE_ENV,
  campaignPhase,
  resolveScheduledAt,
  type CampaignPhase,
} from './campaign-schedule.util';
import { CampaignEmailLog } from './entities/campaign-email-log.entity';
import { EmailOptOut } from './entities/email-opt-out.entity';
import { normalizeEmail, unsubscribeUrl } from './unsubscribe-token.util';

interface Recipient {
  companyId: number;
  companyName: string | null;
  email: string;
}

export interface CampaignPreview {
  campaign: CampaignId;
  subject: string;
  /** Salones a los que les llegaría si se envía ahora. */
  pending: number;
  sent: number;
  failed: number;
  /** Hay un envío corriendo en este momento. */
  running: boolean;
  /** Cuándo sale sola (ISO). */
  scheduledAt: string;
  /** 'scheduled' aún no toca · 'due' saliendo · 'closed' ya pasó su momento. */
  phase: CampaignPhase;
  /**
   * Los envíos automáticos están encendidos en ESTE servidor
   * (`CAMPAIGN_EMAILS_ENABLED=true`). Apagado, el cron no manda nada.
   */
  automatic: boolean;
}

/** Resend deja ~2 envíos por segundo: se va con margen. */
const SEND_GAP_MS = 600;

/**
 * Campañas de correo de la promo Black Friday. Salen SOLAS a su hora (ver
 * `CampaignEmailTask` y `campaign-schedule.util.ts`); el panel solo las mira y
 * manda pruebas.
 *
 * - APAGADAS por defecto: solo corren con `CAMPAIGN_EMAILS_ENABLED=true`, que va
 *   SOLO en producción. Sin esto, el servidor de dev (o una PC) le escribiría
 *   de verdad a los salones de su base el día del envío.
 * - Destinatarios: salones NO desactivados y NO VIP (incluye los que están en
 *   prueba), al correo del usuario dueño (o al del negocio), salvo los que se
 *   dieron de baja de las promociones.
 * - Un correo por salón y campaña, NUNCA dos: la fila del log se reserva con un
 *   índice único ANTES de enviar. Relanzar después de un corte solo manda lo
 *   que faltó.
 * - El envío corre en segundo plano (pueden ser cientos a 2 por segundo): el
 *   panel consulta el avance con la vista previa.
 */
@Injectable()
export class CampaignEmailService {
  private readonly logger = new Logger(CampaignEmailService.name);
  private readonly running = new Set<CampaignId>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CampaignEmailLog)
    private readonly logs: Repository<CampaignEmailLog>,
    @InjectRepository(EmailOptOut)
    private readonly optOuts: Repository<EmailOptOut>,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly promo: PromoService,
  ) {}

  private str(key: string): string | null {
    return this.config.get<string>(key)?.trim() || null;
  }

  /** Base pública del API, para el enlace de baja. */
  get apiBase(): string {
    const explicit = this.str('API_PUBLIC_URL');
    if (explicit) return explicit.replace(/\/+$/, '');
    const assets = this.str('ASSETS_BASE_URL');
    if (assets) return assets.replace(/\/+$/, '').replace(/\/assets$/, '');
    return 'http://localhost:4000';
  }

  /**
   * Secreto de la firma de baja. Si no hay uno propio se deriva del de JWT (con
   * otro prefijo en el HMAC, así una firma no sirve para la otra).
   */
  get unsubscribeSecret(): string {
    const secret =
      this.str('EMAIL_UNSUBSCRIBE_SECRET') ?? this.str('JWT_SECRET');
    if (!secret)
      throw new BadRequestException(
        'Falta EMAIL_UNSUBSCRIBE_SECRET (o JWT_SECRET) para firmar la baja.',
      );
    return secret;
  }

  /** Envíos automáticos encendidos en este servidor. */
  get enabled(): boolean {
    return this.str('CAMPAIGN_EMAILS_ENABLED') === 'true';
  }

  scheduledAt(campaign: CampaignId): Date {
    return resolveScheduledAt(
      campaign,
      this.str(CAMPAIGN_SCHEDULE_ENV[campaign]),
    );
  }

  phase(campaign: CampaignId, now = new Date()): CampaignPhase {
    return campaignPhase(
      campaign,
      this.scheduledAt(campaign),
      this.promo.window,
      now,
    );
  }

  async preview(campaign: CampaignId): Promise<CampaignPreview> {
    const counts: { status: string; n: string }[] = await this.logs
      .createQueryBuilder('l')
      .select('l.status', 'status')
      .addSelect('COUNT(*)', 'n')
      .where('l.campaign = :campaign', { campaign })
      .groupBy('l.status')
      .getRawMany();
    const count = (status: string) =>
      Number(counts.find((c) => c.status === status)?.n ?? 0);

    return {
      campaign,
      subject: campaignSubjectSample(campaign),
      pending: (await this.recipients(campaign)).length,
      sent: count('sent'),
      failed: count('failed'),
      running: this.running.has(campaign),
      scheduledAt: this.scheduledAt(campaign).toISOString(),
      phase: this.phase(campaign),
      automatic: this.enabled,
    };
  }

  /** Un ejemplo a una dirección cualquiera, sin tocar el log. */
  async sendTest(campaign: CampaignId, to: string): Promise<void> {
    const mail = buildCampaignEmail(campaign, this.input('Tu salón', to));
    const result = await this.email.sendCampaignEmail(
      to,
      `[PRUEBA] ${mail.subject}`,
      mail.html,
      unsubscribeUrl(this.apiBase, to, this.unsubscribeSecret),
    );
    if (!result.ok) throw new BadRequestException(`No salió: ${result.error}`);
  }

  /**
   * Lo que llama el cron. Manda las campañas a las que les toca AHORA.
   *
   * Corre cada pocos minutos y es seguro repetirlo: lo ya enviado está en el
   * log (único por salón y campaña), así que una segunda corrida —o un segundo
   * servidor a la vez— solo manda lo que falte. Si el servidor se reinicia a
   * mitad del envío, la siguiente corrida lo completa.
   */
  async runScheduled(now = new Date()): Promise<void> {
    if (!this.enabled) return;
    for (const campaign of CAMPAIGN_IDS) {
      if (this.running.has(campaign)) continue;
      if (this.phase(campaign, now) !== 'due') continue;
      const recipients = await this.recipients(campaign);
      if (!recipients.length) continue;
      // Falla aquí, y no a mitad del envío, si no hay con qué firmar la baja.
      void this.unsubscribeSecret;

      this.running.add(campaign);
      this.logger.warn(
        `[campaña] ${campaign}: envío automático a ${recipients.length} salones.`,
      );
      // Una campaña a la vez: la de intriga y la de la promo no se pisan.
      try {
        await this.run(campaign, recipients);
      } finally {
        this.running.delete(campaign);
      }
    }
  }

  /** Baja de promociones. Idempotente. */
  async optOut(email: string): Promise<void> {
    await this.optOuts
      .createQueryBuilder()
      .insert()
      .into(EmailOptOut)
      .values({ email: normalizeEmail(email) })
      .orIgnore()
      .execute();
    this.logger.log(`[campaña] Baja de promociones: ${normalizeEmail(email)}`);
  }

  private input(companyName: string, to: string) {
    return {
      companyName,
      payUrl: PAY_URL,
      unsubscribeUrl: unsubscribeUrl(this.apiBase, to, this.unsubscribeSecret),
      assetsBaseUrl: this.str('ASSETS_BASE_URL'),
      windowEnd: this.promo.window.end,
    };
  }

  private async run(campaign: CampaignId, recipients: Recipient[]) {
    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      // Reserva ANTES de enviar: si otro envío ya lo tomó, se salta.
      let log: CampaignEmailLog;
      try {
        log = await this.logs.save(
          this.logs.create({
            companyId: r.companyId,
            campaign,
            email: r.email,
            status: 'sending',
          }),
        );
      } catch (error) {
        if (
          error instanceof QueryFailedError &&
          error.message.includes('UQ_campaign_email_log_company_campaign')
        )
          continue;
        this.logger.error(`[campaña] ${campaign}: ${(error as Error).message}`);
        continue;
      }

      const mail = buildCampaignEmail(
        campaign,
        this.input(r.companyName?.trim() || 'tu salón', r.email),
      );
      const result = await this.email.sendCampaignEmail(
        r.email,
        mail.subject,
        mail.html,
        unsubscribeUrl(this.apiBase, r.email, this.unsubscribeSecret),
      );
      log.status = result.ok ? 'sent' : 'failed';
      log.sentAt = result.ok ? new Date() : null;
      log.error = result.ok ? null : result.error.slice(0, 255);
      await this.logs.save(log);
      if (result.ok) sent++;
      else failed++;

      await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
    }
    this.logger.warn(
      `[campaña] ${campaign} terminada: ${sent} enviados, ${failed} fallidos.`,
    );
  }

  /**
   * A quién le toca: salones activos y que pagan (no VIP), con correo, que no
   * se dieron de baja y a los que aún no se les mandó esta campaña.
   */
  private async recipients(campaign: CampaignId): Promise<Recipient[]> {
    const rows: Recipient[] = await this.dataSource.query(
      `SELECT co.id AS companyId,
              co.name AS companyName,
              LOWER(COALESCE(NULLIF(TRIM(u.email), ''), NULLIF(TRIM(co.email), ''))) AS email
         FROM company co
         LEFT JOIN user u ON u.id = co.user_id
         LEFT JOIN subscription s ON s.company_id = co.id
        WHERE co.deactivated_at IS NULL
          AND COALESCE(s.billing_exempt, 0) = 0
          AND COALESCE(NULLIF(TRIM(u.email), ''), NULLIF(TRIM(co.email), '')) IS NOT NULL
          AND NOT EXISTS (
                SELECT 1 FROM email_opt_out o
                 WHERE o.email = LOWER(COALESCE(NULLIF(TRIM(u.email), ''), NULLIF(TRIM(co.email), ''))))
          AND NOT EXISTS (
                SELECT 1 FROM campaign_email_log l
                 WHERE l.company_id = co.id AND l.campaign = ?)
        ORDER BY co.id`,
      [campaign],
    );
    // Un mismo dueño con dos salones recibe UN correo por salón: cada salón es
    // un cliente distinto. Lo que sí se filtra es lo que no parece un correo.
    return rows
      .map((r) => ({ ...r, companyId: Number(r.companyId) }))
      .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
  }
}
