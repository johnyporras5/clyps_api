import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { GRACE_DAYS, getPlan } from '../config/plans.config';
import { Subscription } from '../entities/subscription.entity';
import { PaymentReport } from '../entities/payment-report.entity';
import { ReminderLog } from '../entities/reminder-log.entity';
import { ExchangeRateService } from '../rate/exchange-rate.service';
import { formatVesMinor, CURRENCY_VES } from '../subscription-money.util';
import { quoteAmountVesMinor } from '../subscription-quote.util';
import {
  REMINDER_CHANNELS,
  type ReminderChannelAdapter,
  type ReminderRecipient,
} from './reminder-delivery';
import { dueReminder, type DueReminder } from './reminder-schedule.util';
import {
  buildReminderMessage,
  type PaymentInstructions,
} from './reminder-message.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tope de suscripciones que revisa una corrida. */
const SWEEP_BATCH = 500;

/**
 * Recordatorios de cobro (SUB-8 / CLYP-339).
 *
 * Un barrido diario que mira quién está por vencer y le avisa. Tres reglas que
 * lo mantienen honesto:
 *
 * 1. NO se le insiste a quien ya pagó. Un reporte esperando verificación pausa
 *    TODOS los avisos, incluido el de bloqueo: mientras tú verificas, para el
 *    tenant el asunto está resuelto.
 * 2. NO se repite un aviso. La bitácora `reminder_log` es por
 *    (company, tier, periodEnd): al renovarse el período los tiers vuelven a
 *    estar disponibles, dentro del mismo no.
 * 3. El aviso no sabe por dónde viaja. Produce mensaje + destinatario y la capa
 *    de entrega lo reparte.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(PaymentReport)
    private readonly reports: Repository<PaymentReport>,
    @InjectRepository(ReminderLog)
    private readonly logs: Repository<ReminderLog>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly rates: ExchangeRateService,
    private readonly config: ConfigService,
    @Inject(REMINDER_CHANNELS)
    private readonly channels: ReminderChannelAdapter[],
  ) {}

  /** Ventana de gracia, la misma que usa el control de acceso. */
  get graceDays(): number {
    const raw = Number(this.config.get<string>('SUBSCRIPTION_GRACE_DAYS'));
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : GRACE_DAYS;
  }

  /** A dónde paga el dueño. Lo que falte se omite del mensaje. */
  get instructions(): PaymentInstructions {
    const str = (key: string): string | null =>
      this.config.get<string>(key)?.trim() || null;
    return {
      phone: str('SUBSCRIPTION_PAY_PHONE'),
      bank: str('SUBSCRIPTION_PAY_BANK'),
      identification: str('SUBSCRIPTION_PAY_ID'),
      holder: str('SUBSCRIPTION_PAY_HOLDER'),
      link: str('SUBSCRIPTION_PAY_LINK'),
    };
  }

  // ---------------------------------------------------------------------------
  // El barrido
  // ---------------------------------------------------------------------------

  /** Revisa quién toca hoy y envía. Devuelve cuántos avisos salieron. */
  async sweep(now: Date = new Date()): Promise<number> {
    const candidates = await this.candidates(now);
    if (!candidates.length) return 0;

    const names = await this.recipients(candidates.map((s) => s.companyId));
    // La tasa se consulta UNA vez por corrida, no una por tenant.
    const rate = await this.currentRate();

    let sent = 0;
    for (const subscription of candidates) {
      try {
        const due = dueReminder({
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
          graceEndsAt: subscription.graceEndsAt,
          graceDays: this.graceDays,
          now,
        });
        if (!due) continue;

        const recipient = names.get(subscription.companyId);
        if (!recipient) continue;

        if (await this.shouldSkip(subscription.companyId, due)) continue;

        const delivered = await this.send(subscription, due, recipient, rate);
        if (delivered) sent += 1;
      } catch (error) {
        // Un tenant que falla no puede tumbar el barrido de los demás.
        this.logger.error(
          `Error avisando a la company ${subscription.companyId}: ${
            (error as Error).message
          }`,
        );
      }
    }

    return sent;
  }

  /**
   * Suscripciones que podrían tener aviso hoy: las que vencen en los próximos
   * 8 días o vencieron dentro de la ventana de gracia. Los exentos quedan fuera
   * — a quien no se le cobra no se le recuerda pagar.
   */
  private async candidates(now: Date): Promise<Subscription[]> {
    const from = new Date(now.getTime() - (this.graceDays + 7) * DAY_MS);
    const to = new Date(now.getTime() + 8 * DAY_MS);

    return this.subscriptions
      .createQueryBuilder('s')
      .where('s.billingExempt = :exempt', { exempt: false })
      .andWhere(
        '(s.currentPeriodEnd BETWEEN :from AND :to OR s.trialEndsAt BETWEEN :from AND :to)',
        { from, to },
      )
      .orderBy('s.id', 'ASC')
      .take(SWEEP_BATCH)
      .getMany();
  }

  /** Dueño y correo de cada salón, en una sola consulta. */
  private async recipients(
    companyIds: number[],
  ): Promise<Map<number, ReminderRecipient>> {
    if (!companyIds.length) return new Map();

    const companies = await this.companies.find({
      where: companyIds.map((id) => ({ id })),
      select: { id: true, name: true, email: true, userId: true },
    });

    return new Map(
      companies.map((company) => [
        company.id,
        {
          companyId: company.id,
          companyName: company.name ?? `Salón ${company.id}`,
          userId: company.userId ?? null,
          email: company.email ?? null,
        },
      ]),
    );
  }

  /** La tasa del día. Si las fuentes fallan, el aviso sale sin monto. */
  private async currentRate(): Promise<number | null> {
    try {
      return (await this.rates.fetchRate()).rate;
    } catch (error) {
      this.logger.warn(
        `Sin tasa para los recordatorios de hoy: ${(error as Error).message}`,
      );
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Los dos guardas
  // ---------------------------------------------------------------------------

  private async shouldSkip(
    companyId: number,
    due: DueReminder,
  ): Promise<boolean> {
    if (await this.hasPendingOrVerifiedReport(companyId, due.periodEnd))
      return true;
    return this.alreadySent(companyId, due);
  }

  /**
   * ¿Ya pagó lo que se le iba a recordar?
   *
   * Un reporte en `reported` pausa el aviso aunque todavía no esté verificado:
   * el dueño ya hizo su parte y pedirle que pague otra vez mientras esperamos
   * es la forma más rápida de que deje de creer en los avisos.
   *
   * Un `verified` con fecha posterior al vencimiento significa que el pago del
   * próximo período ya entró (aunque el barrido corra antes de que el período
   * se refleje), así que tampoco se avisa.
   */
  async hasPendingOrVerifiedReport(
    companyId: number,
    periodEnd: Date,
  ): Promise<boolean> {
    const pending = await this.reports.countBy({
      companyId,
      status: 'reported',
    });
    if (pending > 0) return true;

    const covered = await this.reports.count({
      where: {
        companyId,
        status: 'verified',
        verifiedAt: MoreThanOrEqual(periodEnd),
      },
    });
    return covered > 0;
  }

  /** ¿Este mismo tier ya salió para este mismo vencimiento? */
  private async alreadySent(
    companyId: number,
    due: DueReminder,
  ): Promise<boolean> {
    const existing = await this.logs.findOne({
      where: { companyId, tier: due.tier, periodEnd: due.periodEnd },
      select: { id: true },
    });
    return existing !== null;
  }

  // ---------------------------------------------------------------------------
  // El envío
  // ---------------------------------------------------------------------------

  private async send(
    subscription: Subscription,
    due: DueReminder,
    recipient: ReminderRecipient,
    rate: number | null,
  ): Promise<boolean> {
    const plan = getPlan(subscription.planId);
    const amountFormatted =
      rate === null ? null : formatVesMinor(quoteAmountVesMinor(plan.id, rate));

    const message = buildReminderMessage({
      tier: due.tier,
      companyName: recipient.companyName,
      planName: plan.name,
      periodEnd: due.periodEnd,
      graceEndsAt: due.graceEndsAt,
      daysLeft: due.daysLeft,
      amountFormatted,
      currency: CURRENCY_VES,
      instructions: this.instructions,
    });

    const delivered: ReminderLog[] = [];
    for (const channel of this.channels) {
      if (!channel.isEnabled()) continue;
      const ok = await channel.deliver(recipient, message);
      if (!ok) continue;
      delivered.push(
        this.logs.create({
          companyId: recipient.companyId,
          tier: due.tier,
          periodEnd: due.periodEnd,
          channel: channel.channel,
          sentAt: new Date(),
        }),
      );
    }

    // Sin entrega no se escribe bitácora: mañana se vuelve a intentar.
    if (!delivered.length) return false;

    await this.logs.save(delivered);
    this.logger.log(
      `Recordatorio ${due.tier} enviado a la company ${recipient.companyId} ` +
        `por ${delivered.map((row) => row.channel).join(', ')}`,
    );
    return true;
  }
}
