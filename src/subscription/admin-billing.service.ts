import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Company } from '../company/entities/company.entity';
import { Subscription } from './entities/subscription.entity';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionService } from './subscription.service';
import { CobrixInvoiceService } from './cobrix/cobrix-invoice.service';
import { resolveAccess } from './entitlements.util';
import {
  EXTRA_TRIAL_DAYS,
  extendedTrialEnd,
  trialAfterVipRevoked,
} from './admin-billing.util';
import type { AccessResponse } from './dto/access-response.dto';
import { AdminBillingNotifierService } from './notifications/admin-billing-notifier.service';

/** Lo que el panel necesita del cobro de un salón, además del acceso. */
export interface AdminBillingState {
  /** Pagó alguna vez (`current_period_end` no es null). */
  everPaid: boolean;
  access: AccessResponse;
}

/** Respuesta de hacer VIP, quitar el VIP o alargar la prueba. */
export interface AdminBillingResponse {
  companyId: number;
  /** false = ya estaba así; no se tocó nada. */
  changed: boolean;
  /** Texto listo para enseñar. */
  message: string;
  /**
   * Cobros de Cobrix que siguen vivos y hay que anular a mano (solo al hacer
   * VIP): o Cobrix no confirmó, o tenían un pago en revisión.
   */
  invoicesToReview: string[];
  /** Cómo quedó, para repintar la ficha sin volver a pedirla. */
  state: AdminBillingState;
}

/**
 * El cobro de un salón desde el panel de la PLATAFORMA (`padm`):
 *   - VIP: la marca `billing_exempt`. No paga, no vence, no le llegan
 *     recordatorios. Conserva SU plan (ver la migración 065).
 *   - Quitar VIP: vuelve a cobrársele, con 15 días de prueba desde hoy para
 *     que no quede bloqueado en el acto.
 *   - +15 días de prueba: a cualquier salón que no sea VIP, lo decide el
 *     administrador. Se suman a lo más lejano entre hoy y su fin de prueba
 *     (nunca quita días).
 *
 * Cada cambio lee la fila con `pessimistic_write` dentro de su transacción: dos
 * clics o dos operadores a la vez se hacen en fila, y el segundo ve lo que dejó
 * el primero (no anula cobros dos veces, y +15 suma sobre la fecha nueva).
 */
@Injectable()
export class AdminBillingService {
  private readonly logger = new Logger(AdminBillingService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    private readonly subscriptionService: SubscriptionService,
    private readonly entitlements: EntitlementsService,
    private readonly cobrixInvoices: CobrixInvoiceService,
    private readonly notifier: AdminBillingNotifierService,
  ) {}

  /** El estado de cobro que pinta el panel. */
  async state(companyId: number): Promise<AdminBillingState> {
    const subscription = await this.subscriptions.findOne({
      where: { companyId },
    });
    return {
      everPaid: subscription?.currentPeriodEnd != null,
      access: await this.entitlements.getAccessResponse(companyId),
    };
  }

  async grantVip(
    companyId: number,
    actorUserId: number,
  ): Promise<AdminBillingResponse> {
    await this.findCompanyOrFail(companyId);
    // Sin fila no hay dónde poner la marca. `ensureSubscription` la crea con
    // su prueba normal; es idempotente y aguanta carreras.
    await this.subscriptionService.ensureSubscription(companyId);

    const changed = await this.dataSource.transaction(async (manager) => {
      const sub = await manager.findOne(Subscription, {
        where: { companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sub || sub.billingExempt) return false;

      sub.billingExempt = true;
      // `status` es una caché; se deja coherente con lo que dirá resolveAccess.
      sub.status = 'active';
      await manager.save(Subscription, sub);
      return true;
    });

    this.entitlements.invalidate(companyId);

    if (!changed) {
      return this.respond(companyId, false, 'El salón ya era VIP.', []);
    }

    // Sin esto, el dueño podía pagar el cobro que ya tenía abierto y Cobrix le
    // mandaría el recibo. Va DESPUÉS de la transacción y es de mejor esfuerzo:
    // si Cobrix falla, el salón queda VIP igual y lo pendiente vuelve en
    // `invoicesToReview`.
    const charges = await this.releaseOpenCharges(companyId);
    this.logger.warn(
      `Salón ${companyId} marcado VIP (exento de cobro) por el usuario ${actorUserId}.` +
        ` Cobros anulados: ${charges.released.length}, por revisar: ${charges.toReview.length}.`,
    );

    // Sin `await`: el panel no espera al correo, y el notificador nunca lanza.
    void this.notifier.vipGranted(companyId, new Date());

    const parts = ['El salón ahora es VIP: no se le cobra.'];
    if (charges.released.length > 0)
      parts.push('Se anuló su cobro pendiente en Cobrix.');
    if (charges.toReview.length > 0)
      parts.push(`Revisa a mano en Cobrix: ${charges.toReview.join(', ')}.`);

    return this.respond(companyId, true, parts.join(' '), charges.toReview);
  }

  async revokeVip(
    companyId: number,
    actorUserId: number,
  ): Promise<AdminBillingResponse> {
    await this.findCompanyOrFail(companyId);
    const now = new Date();

    const newTrialEnd = await this.dataSource.transaction(async (manager) => {
      const sub = await manager.findOne(Subscription, {
        where: { companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sub || !sub.billingExempt) return undefined;

      sub.billingExempt = false;
      const trialEnd = trialAfterVipRevoked(sub, now);
      if (trialEnd) sub.trialEndsAt = trialEnd;
      // Una gracia guardada que ya pasó lo bloquearía al vencer la prueba
      // nueva sin darle sus días: se limpia. Una a futuro se respeta.
      if (sub.graceEndsAt && sub.graceEndsAt.getTime() <= now.getTime())
        sub.graceEndsAt = null;
      sub.status = resolveAccess({
        subscription: sub,
        hasPendingReport: false,
        now,
      }).status;
      await manager.save(Subscription, sub);
      return trialEnd;
    });

    this.entitlements.invalidate(companyId);

    if (newTrialEnd === undefined) {
      return this.respond(companyId, false, 'El salón no era VIP.', []);
    }

    this.logger.warn(
      `Salón ${companyId}: VIP retirado por el usuario ${actorUserId}.` +
        (newTrialEnd
          ? ` Prueba hasta ${newTrialEnd.toISOString()}.`
          : ' Su período vigente ya cubría más de 15 días.'),
    );

    return this.respond(
      companyId,
      true,
      newTrialEnd
        ? `El salón ya no es VIP. Tiene ${EXTRA_TRIAL_DAYS} días de prueba y luego tendrá que pagar.`
        : 'El salón ya no es VIP. Su acceso actual ya llegaba más lejos, así que no se le tocaron las fechas.',
      [],
    );
  }

  async extendTrial(
    companyId: number,
    actorUserId: number,
  ): Promise<AdminBillingResponse> {
    await this.findCompanyOrFail(companyId);

    // Sin fila: crearla YA le abre su prueba normal de 15 días desde hoy, que
    // es justo lo pedido. Sumarle otros 15 encima serían 30.
    const existed = await this.subscriptions.exists({ where: { companyId } });
    if (!existed) {
      const opened =
        await this.subscriptionService.ensureSubscription(companyId);
      this.entitlements.invalidate(companyId);
      // Se le ABRIÓ la prueba: el correo dice "te activamos", no "15 más".
      if (opened?.trialEndsAt)
        void this.notifier.trialExtended(companyId, opened.trialEndsAt, true);
      this.logger.warn(
        `Salón ${companyId}: no tenía suscripción; se le abrió la prueba de ${EXTRA_TRIAL_DAYS} días` +
          ` (usuario ${actorUserId}).`,
      );
      return this.respond(
        companyId,
        true,
        `No tenía suscripción: se le abrió su prueba de ${EXTRA_TRIAL_DAYS} días desde hoy.`,
        [],
      );
    }

    const now = new Date();
    const newTrialEnd = await this.dataSource.transaction(async (manager) => {
      // Con el bloqueo, dos clics casi juntos se hacen uno detrás del otro:
      // el segundo suma sobre la fecha que dejó el primero, no sobre la vieja.
      const sub = await manager.findOne(Subscription, {
        where: { companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sub) throw new NotFoundException('El salón no tiene suscripción.');
      // Un VIP no paga ni vence: días de prueba no le cambian nada. Se revisa
      // dentro del bloqueo, por si lo hicieron VIP justo antes de este clic.
      if (sub.billingExempt)
        throw new ConflictException(
          'El salón es VIP: no vence, no necesita días de prueba. Quítale el VIP primero si quieres darle prueba.',
        );

      const trialEnd = extendedTrialEnd(sub.trialEndsAt, now);
      sub.trialEndsAt = trialEnd;
      if (sub.graceEndsAt && sub.graceEndsAt.getTime() <= now.getTime())
        sub.graceEndsAt = null;
      // Caché coherente con resolveAccess: quien tiene un mes pagado que llega
      // más lejos sigue en `active`, no pasa a `trialing`.
      sub.status = resolveAccess({
        subscription: sub,
        hasPendingReport: false,
        now,
      }).status;
      await manager.save(Subscription, sub);
      return trialEnd;
    });

    this.entitlements.invalidate(companyId);
    this.logger.warn(
      `Salón ${companyId}: +${EXTRA_TRIAL_DAYS} días de prueba (hasta ${newTrialEnd.toISOString()})` +
        ` por el usuario ${actorUserId}.`,
    );
    void this.notifier.trialExtended(companyId, newTrialEnd, false);

    return this.respond(
      companyId,
      true,
      `Se le sumaron ${EXTRA_TRIAL_DAYS} días de prueba.`,
      [],
    );
  }

  private async releaseOpenCharges(
    companyId: number,
  ): Promise<{ released: string[]; toReview: string[] }> {
    try {
      const result = await this.cobrixInvoices.releaseAllForCompany(
        companyId,
        'salón marcado VIP desde el panel',
      );
      return {
        released: result.released,
        toReview: [...result.unconfirmed, ...result.skippedWithPayment],
      };
    } catch (error) {
      this.logger.error(
        `No se pudieron anular los cobros de Cobrix del salón ${companyId}: ${(error as Error).message}`,
      );
      return {
        released: [],
        toReview: ['no se pudo consultar; revisa sus facturas abiertas'],
      };
    }
  }

  private async respond(
    companyId: number,
    changed: boolean,
    message: string,
    invoicesToReview: string[],
  ): Promise<AdminBillingResponse> {
    return {
      companyId,
      changed,
      message,
      invoicesToReview,
      state: await this.state(companyId),
    };
  }

  private async findCompanyOrFail(companyId: number): Promise<void> {
    const exists = await this.companies.exists({ where: { id: companyId } });
    if (!exists) throw new NotFoundException('El salón no existe.');
  }
}
