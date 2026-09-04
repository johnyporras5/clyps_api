import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { Subscription } from '../entities/subscription.entity';
import { PaymentReport } from '../entities/payment-report.entity';
import { SubscriptionInvoice } from '../entities/subscription-invoice.entity';
import { ExchangeRateService } from '../rate/exchange-rate.service';
import { getPlan, type PlanId } from '../config/plans.config';
import { quoteAmountVesMinor } from '../subscription-quote.util';
import { CURRENCY_VES, formatVesMinor } from '../subscription-money.util';
import { CobrixConfig } from './cobrix.config';
import { CobrixClient } from './cobrix.client';
import type { CheckoutResponse } from '../dto/checkout-response.dto';

/**
 * Emisión del documento de cobro en Cobrix (SUB-10).
 *
 * ORDEN QUE IMPORTA: la factura se emite ANTES de que el tenant pague, no
 * después. Cobrix concilia movimientos bancarios contra documentos ABIERTOS —
 * sin un documento emitido, el Pago Móvil que entra a la cuenta de Clyps es
 * plata que ve pero no sabe a quién aplicar, y no llega ningún webhook.
 *
 * Por eso esto cuelga de un endpoint propio (`POST /subscription/payments/checkout`)
 * y no de la cotización: cotizar sigue sin escribir nada ni llamar a nadie, y
 * emitir un cobro real es una acción explícita del dueño.
 *
 * Emitir la factura NO da acceso, igual que reportar no lo da (SUB-3): el
 * período solo se mueve cuando el pago se confirma (SUB-6).
 */
@Injectable()
export class CobrixInvoiceService {
  private readonly logger = new Logger(CobrixInvoiceService.name);

  constructor(
    @InjectRepository(SubscriptionInvoice)
    private readonly invoices: Repository<SubscriptionInvoice>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(PaymentReport)
    private readonly reports: Repository<PaymentReport>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly rates: ExchangeRateService,
    private readonly client: CobrixClient,
    private readonly config: CobrixConfig,
  ) {}

  /**
   * Emite (o reutiliza) el documento de cobro del mes de este salón.
   *
   * Pulsar el botón dos veces, o recargar la pantalla de pago, NO emite dos
   * facturas: mientras haya una viva se devuelve la misma con su enlace.
   */
  async startCheckout(
    companyId: number,
    input: { planId?: PlanId; identification?: string } = {},
  ): Promise<CheckoutResponse> {
    if (!this.config.enabled) {
      this.logger.error(
        '[cobrix] Checkout pedido pero falta COBRIX_API_KEY o COBRIX_WEBHOOK_SECRET',
      );
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'COBRIX_NOT_CONFIGURED',
        message: 'El pago automático no está disponible en este momento.',
      });
    }

    const subscription = await this.subscriptions.findOne({
      where: { companyId },
      select: { id: true, planId: true },
    });
    if (!subscription)
      throw new BadRequestException(
        'No hay una suscripción para esta compañía: no se puede emitir el cobro.',
      );

    const planId = input.planId ?? subscription.planId;
    const company = await this.companies.findOne({
      where: { id: companyId },
      select: { id: true, name: true, email: true },
    });

    // Cobrix manda el recibo por correo y lo usa para identificar al cliente:
    // sin dirección rechaza la factura, así que el corte es acá y con un
    // mensaje que la app pueda mostrar.
    const email = company?.email?.trim();
    if (!email)
      throw new BadRequestException({
        statusCode: 400,
        code: 'EMAIL_REQUIRED',
        message:
          'Tu salón no tiene un correo cargado y Cobrix lo necesita para emitir el cobro.',
      });

    // La cédula/RIF solo se pide la PRIMERA vez: de ahí en más se reusa la que
    // ya escribió y el botón lo lleva directo a pagar. Si manda una nueva,
    // manda la nueva — puede estar corrigiéndola.
    const identification =
      input.identification?.trim().toUpperCase() ||
      (await this.lastIdentification(companyId));
    if (!identification)
      throw new BadRequestException({
        statusCode: 400,
        code: 'IDENTIFICATION_REQUIRED',
        message: 'Necesitamos tu cédula o RIF para emitir el cobro.',
      });

    // Un checkout abandonado no puede dejar al salón trabado para siempre.
    await this.expireStale(companyId);

    const live = await this.findLive(companyId);
    // La factura ya emitida lleva los datos viejos y Cobrix no la deja editar,
    // así que reutilizarla sería ignorar la corrección en silencio.
    const changesIdentification =
      Boolean(input.identification?.trim()) &&
      Boolean(live) &&
      live!.payerIdentification.toUpperCase() !== identification;
    const changesPlan = Boolean(live) && live!.planId !== planId;

    if (live && !changesIdentification && !changesPlan) {
      this.logger.log(
        `[cobrix] Se reutiliza la factura ${live.providerReference} de la company ${companyId}`,
      );
      return this.toResponse(live, true);
    }

    if (live) {
      live.status = 'replaced';
      await this.invoices.save(live);
      this.logger.log(
        `[cobrix] Factura ${live.providerReference} reemplazada: cambiaron ${
          changesPlan ? 'el plan' : 'los datos de facturación'
        }`,
      );
    }

    const invoice = await this.emit(
      companyId,
      subscription.id,
      planId,
      identification,
      company?.name?.trim() || `Salón ${companyId}`,
      email,
    );
    return this.toResponse(invoice, false);
  }

  /**
   * Cotiza, emite en Cobrix y persiste. La factura se emite ANTES de guardar la
   * fila: si Cobrix falla no queda un documento fantasma de nuestro lado. El
   * costo es el inverso —si el guardado se cae queda una factura sin dueño en
   * Cobrix— y es el lado barato: esa factura vence sola y nadie la paga.
   */
  private async emit(
    companyId: number,
    subscriptionId: number,
    planId: PlanId,
    identification: string,
    name: string,
    email: string,
  ): Promise<SubscriptionInvoice> {
    const plan = getPlan(planId);
    const fetched = await this.rates.fetchRate();

    // La API pública de facturas NO lleva campo de moneda: manda un número y
    // Cobrix lo interpreta en la moneda de la cuenta. Si la cuenta está en
    // bolívares y se le mandan los dólares del plan, factura "VES 20,25".
    const isVes = this.config.currency === CURRENCY_VES;
    const listPriceMinor = isVes
      ? quoteAmountVesMinor(plan.id, fetched.rate)
      : plan.priceUsdMinor;

    // ⚠️ Andamio de pruebas: factura un monto simbólico en vez del precio del
    // plan. Cada uso deja rastro en el log a propósito — es la única red que
    // hay si la variable se queda puesta.
    const testMinor = this.config.testAmountMinorFor(companyId);
    const amountMinor = testMinor ?? listPriceMinor;
    if (testMinor !== null) {
      this.logger.warn(
        `⚠️ [cobrix] ANDAMIO DE PRUEBAS ACTIVO: se factura ${testMinor / 100} ` +
          `${this.config.currency} en vez de ${listPriceMinor / 100} (company ${companyId}). ` +
          'Quita COBRIX_TEST_AMOUNT para cobrar el precio del plan.',
      );
    }

    const expiresAt = new Date(
      Date.now() + this.config.invoiceTtlHours * 60 * 60 * 1000,
    );
    // Referencia única por intento. Lleva el timestamp porque un mismo salón
    // paga muchos meses, y es lo que casa el webhook con esta fila.
    const providerReference = `${this.config.provider}-${companyId}-${Math.floor(
      Date.now() / 1000,
    )}`;

    const created = await this.client.createInvoice({
      identification,
      providerReference,
      // Cobrix recibe unidades MAYORES con dos decimales.
      amount: Math.round(amountMinor) / 100,
      name,
      email,
      dueDate: expiresAt.toISOString().slice(0, 10),
    });

    const invoice = await this.invoices.save(
      this.invoices.create({
        companyId,
        subscriptionId,
        planId,
        provider: this.config.provider,
        providerReference,
        providerInvoiceId: created.invoiceId,
        checkoutUrl: created.paymentLink,
        amountMinor,
        currency: this.config.currency,
        frozenRate: isVes ? fetched.rate : null,
        quotedAt: fetched.fetchedAt,
        payerIdentification: identification,
        status: 'open',
        expiresAt,
        paidAt: null,
        providerPayload: created.raw,
      }),
    );

    this.logger.log(
      `[cobrix] Factura ${providerReference} emitida por ${amountMinor / 100} ${this.config.currency} (company ${companyId})`,
    );
    return invoice;
  }

  /** La factura viva del salón: la única contra la que Cobrix puede conciliar. */
  async findLive(companyId: number): Promise<SubscriptionInvoice | null> {
    const open = await this.invoices.findOne({
      where: { companyId, status: 'open' },
      order: { id: 'DESC' },
    });
    return open && open.expiresAt.getTime() > Date.now() ? open : null;
  }

  /**
   * Cierra las facturas que vencieron sin pagarse.
   *
   * No es una decisión sobre el dinero: si el pago entra tarde, el webhook la
   * revive igual (ver el servicio del webhook). Esto solo desbloquea al dueño
   * para que pueda pedir un cobro nuevo.
   */
  async expireStale(companyId?: number): Promise<number> {
    const result = await this.invoices.update(
      {
        status: 'open',
        expiresAt: LessThanOrEqual(new Date()),
        ...(companyId === undefined ? {} : { companyId }),
      },
      { status: 'expired' },
    );
    return result.affected ?? 0;
  }

  /**
   * La cédula/RIF con la que este salón ya facturó alguna vez.
   *
   * La app nunca pidió el RIF —no hay columna en `company`— así que la primera
   * vez hay que preguntárselo. A partir de ahí queda guardado y no se le vuelve
   * a pedir. Se toma el más reciente: si alguna vez lo corrigió, el bueno es el
   * último.
   */
  private async lastIdentification(companyId: number): Promise<string | null> {
    const invoice = await this.invoices.findOne({
      where: { companyId },
      order: { id: 'DESC' },
      select: { id: true, payerIdentification: true },
    });
    if (invoice?.payerIdentification) return invoice.payerIdentification;

    const report = await this.reports.findOne({
      where: { companyId },
      order: { id: 'DESC' },
      select: { id: true, payerIdentification: true },
    });
    return report?.payerIdentification?.trim() || null;
  }

  private toResponse(
    invoice: SubscriptionInvoice,
    reused: boolean,
  ): CheckoutResponse {
    return {
      invoiceId: invoice.id,
      providerReference: invoice.providerReference,
      paymentLink: invoice.checkoutUrl,
      planId: invoice.planId,
      planName: getPlan(invoice.planId).name,
      amountMinor: invoice.amountMinor,
      amountFormatted:
        invoice.currency === CURRENCY_VES
          ? formatVesMinor(invoice.amountMinor)
          : (invoice.amountMinor / 100).toFixed(2),
      currency: invoice.currency,
      frozenRate: invoice.frozenRate,
      quotedAt: invoice.quotedAt ? invoice.quotedAt.toISOString() : null,
      expiresAt: invoice.expiresAt.toISOString(),
      payerIdentification: invoice.payerIdentification,
      reused,
    };
  }
}
