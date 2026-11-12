import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaymentReport } from './entities/payment-report.entity';
import { Subscription } from './entities/subscription.entity';
import {
  OFFER_IDS,
  OFFER_WINDOW_ENV,
  OFFERS,
  PROMO_UPGRADE,
  getOffer,
  type CampaignId,
  type OfferId,
} from './config/offers.config';
import { getPlan, type PlanId } from './config/plans.config';
import {
  OFFER_BLOCK_MESSAGES,
  UPGRADE_BLOCK_MESSAGES,
  availableOffers,
  offerBlockReason,
  resolveOfferWindow,
  upgradeBlockReason,
  type OfferWindow,
} from './offers.util';
import { regularCharge, type PaymentCharge } from './payment-charge';
import { billablePlanId } from './entitlements.util';
import type {
  OffersResponse,
  PublicOffersResponse,
} from './dto/offers-response.dto';

/** Lo que pide el front: un plan, una oferta o la mejora. Nunca un precio. */
export interface ChargeRequest {
  planId?: PlanId;
  offerId?: OfferId;
  upgrade?: boolean;
}

/**
 * - `quote`: cotizar o abrir el cobro de Cobrix. La ventana es la exacta.
 * - `report`: reportar un pago ya hecho. La ventana se estira unas horas
 *   (`PROMO_BF_REPORT_GRACE_HOURS`): quien pagó el último día a las 11 p. m.
 *   tiene que poder reportarlo aunque ya sea el día siguiente.
 */
export type ChargeMode = 'quote' | 'report';

const CAMPAIGN: CampaignId = 'bf2026';
const LIVE: PaymentReport['status'][] = ['reported', 'verified'];
const CAMPAIGN_OFFERS: OfferId[] = OFFER_IDS.filter(
  (id) => OFFERS[id].campaign === CAMPAIGN,
);
const DEFAULT_REPORT_GRACE_HOURS = 48;

/**
 * La promo Black Friday: qué ofertas ve cada salón y qué se le cobra.
 *
 * Es el ÚNICO lugar que convierte "quiero la oferta X" en un precio. Cotizar,
 * abrir el cobro de Cobrix y reportar pasan todos por `resolveCharge`, así que
 * no hay forma de llegar a un precio de promo saltándose las reglas.
 *
 * "Una sola vez" se revisa aquí para dar un mensaje claro, pero quien lo
 * garantiza contra dos envíos simultáneos es el índice único de la base
 * (`UQ_payment_report_company_promo_slot`, migración ...084).
 */
@Injectable()
export class PromoService implements OnModuleInit {
  private readonly logger = new Logger(PromoService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(PaymentReport)
    private readonly reports: Repository<PaymentReport>,
    private readonly config: ConfigService,
  ) {}

  /** Una ventana mal escrita se avisa UNA vez al arrancar, no en cada request. */
  onModuleInit(): void {
    const { window, warnings } = this.resolve();
    for (const warning of warnings) this.logger.warn(`[promo] ${warning}`);
    this.logger.log(
      `[promo] Black Friday activa de ${window.start.toISOString()} a ${window.end.toISOString()}`,
    );
  }

  private resolve() {
    return resolveOfferWindow({
      start: this.config.get<string>(OFFER_WINDOW_ENV.start),
      end: this.config.get<string>(OFFER_WINDOW_ENV.end),
    });
  }

  get window(): OfferWindow {
    return this.resolve().window;
  }

  private get reportGraceMs(): number {
    const raw = Number(this.config.get<string>('PROMO_BF_REPORT_GRACE_HOURS'));
    const hours =
      Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_REPORT_GRACE_HOURS;
    return hours * 60 * 60 * 1000;
  }

  /** La ventana que aplica según el momento: exacta, o estirada al reportar. */
  private windowFor(mode: ChargeMode): OfferWindow {
    const window = this.window;
    return mode === 'report'
      ? {
          start: window.start,
          end: new Date(window.end.getTime() + this.reportGraceMs),
        }
      : window;
  }

  /**
   * Lo que pinta la LANDING pública: las ofertas, solo mientras la promo está
   * abierta. No mira ningún salón (no hay sesión): ni "ya la tomó" ni VIP, eso
   * lo resuelve la app al pagar. Fuera de la ventana devuelve la lista vacía,
   * así la landing no tiene que saber las fechas.
   */
  publicOffers(now: Date = new Date()): PublicOffersResponse {
    const window = this.window;
    const offers = availableOffers({
      now,
      window,
      billingExempt: false,
      campaignTaken: false,
    });
    return {
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
      offers: offers.map((offer) => ({
        id: offer.id,
        name: offer.name,
        planId: offer.planId,
        planName: getPlan(offer.planId).name,
        months: offer.months,
        priceUsdMinor: offer.priceUsdMinor,
        regularUsdMinor: offer.regularUsdMinor,
        savingsUsdMinor: offer.regularUsdMinor - offer.priceUsdMinor,
      })),
    };
  }

  /** Lo que pinta la pantalla de pago: ofertas disponibles y la mejora. */
  async status(
    companyId: number,
    now: Date = new Date(),
  ): Promise<OffersResponse> {
    const subscription = await this.subscriptions.findOne({
      where: { companyId },
    });
    const window = this.window;
    const billingExempt = Boolean(subscription?.billingExempt);
    const campaignTaken = await this.campaignTaken(companyId);
    const offers = availableOffers({
      now,
      window,
      billingExempt,
      campaignTaken,
    });

    const upgradeCtx = await this.upgradeContext(companyId, subscription, now);
    const upgradeOk = upgradeBlockReason(upgradeCtx) === null;

    return {
      campaign: CAMPAIGN,
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
      taken: campaignTaken,
      offers: offers.map((offer) => ({
        id: offer.id,
        name: offer.name,
        planId: offer.planId,
        planName: getPlan(offer.planId).name,
        months: offer.months,
        priceUsdMinor: offer.priceUsdMinor,
        regularUsdMinor: offer.regularUsdMinor,
        savingsUsdMinor: offer.regularUsdMinor - offer.priceUsdMinor,
      })),
      upgrade: upgradeOk
        ? {
            priceUsdMinor: PROMO_UPGRADE.priceUsdMinor,
            toPlanId: OFFERS[PROMO_UPGRADE.to].planId,
            coversUntil: upgradeCtx.offerCoversUntil!.toISOString(),
          }
        : null,
    };
  }

  /**
   * Qué se cobra. Lanza 400 con un `code` que el front sabe mostrar si el salón
   * no tiene derecho a lo que pidió.
   */
  async resolveCharge(
    companyId: number,
    request: ChargeRequest,
    mode: ChargeMode,
    now: Date = new Date(),
  ): Promise<PaymentCharge> {
    if (request.offerId && request.upgrade)
      throw new BadRequestException({
        statusCode: 400,
        code: 'PROMO_INVALID_REQUEST',
        message: 'Elige una promoción o la mejora a Full, no las dos.',
      });

    const subscription = await this.subscriptions.findOne({
      where: { companyId },
    });

    if (request.upgrade) {
      const reason = upgradeBlockReason(
        await this.upgradeContext(companyId, subscription, now),
      );
      if (reason)
        throw new BadRequestException({
          statusCode: 400,
          code: `PROMO_UPGRADE_${reason.toUpperCase()}`,
          message: UPGRADE_BLOCK_MESSAGES[reason],
        });
      const to = getOffer(PROMO_UPGRADE.to);
      return {
        kind: 'promo_upgrade',
        planId: to.planId,
        offerId: PROMO_UPGRADE.to,
        months: 0,
        priceUsdMinor: PROMO_UPGRADE.priceUsdMinor,
        label: 'Black Friday · Mejora a Full',
      };
    }

    if (request.offerId) {
      const offer = getOffer(request.offerId);
      const reason = offerBlockReason({
        now,
        window: this.windowFor(mode),
        billingExempt: Boolean(subscription?.billingExempt),
        campaignTaken: await this.campaignTaken(companyId),
      });
      if (reason)
        throw new BadRequestException({
          statusCode: 400,
          code: `PROMO_${reason.toUpperCase()}`,
          message: OFFER_BLOCK_MESSAGES[reason],
        });
      return {
        kind: 'promo',
        planId: offer.planId,
        offerId: offer.id,
        months: offer.months,
        priceUsdMinor: offer.priceUsdMinor,
        label: offer.name,
      };
    }

    return regularCharge(
      request.planId ?? billablePlanId(subscription?.planId ?? null),
    );
  }

  /** ¿Ya tiene una oferta de la campaña pendiente o verificada? */
  private async campaignTaken(companyId: number): Promise<boolean> {
    return this.reports.exists({
      where: {
        companyId,
        kind: 'promo',
        offerId: In(CAMPAIGN_OFFERS),
        status: In(LIVE),
      },
    });
  }

  private async upgradeContext(
    companyId: number,
    subscription: Subscription | null,
    now: Date,
  ) {
    const promo = await this.reports.findOne({
      where: {
        companyId,
        kind: 'promo',
        offerId: In(CAMPAIGN_OFFERS),
        status: 'verified',
      },
      order: { id: 'DESC' },
    });
    const upgradeTaken = await this.reports.exists({
      where: { companyId, kind: 'promo_upgrade', status: In(LIVE) },
    });
    return {
      now,
      billingExempt: Boolean(subscription?.billingExempt),
      currentPlanId: subscription?.planId ?? null,
      verifiedOfferId: promo?.offerId ?? null,
      offerCoversUntil: promo?.coveredTo ?? null,
      upgradeTaken,
    };
  }
}
