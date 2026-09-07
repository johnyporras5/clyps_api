import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { Company } from '../../company/entities/company.entity';
import type {
  ReminderChannelAdapter,
  ReminderRecipient,
} from '../reminders/reminder-delivery';
import type { DeliverableMessage } from '../reminders/reminder-message.util';
import { PaymentOutcomeService } from './payment-outcome.service';
import type { SubscriptionActivatedEvent } from '../subscription.service';
import type { SubscriptionPaymentRejectedEvent } from './payment-outcome.events';
import type { EntitlementsService } from '../entitlements.service';

/**
 * SUB-9: el aviso sale por la capa de entrega de SUB-8, y ningún fallo de
 * canal puede propagarse — el pago ya está decidido cuando llega aquí.
 */

interface Sent {
  recipient: ReminderRecipient;
  message: DeliverableMessage;
}

function buildService(options: {
  company?: Partial<Company> | null;
  /** El canal in-app revienta al entregar. */
  inAppThrows?: boolean;
  /** El canal de correo está apagado por configuración. */
  emailDisabled?: boolean;
  /** Cómo queda el acceso al rechazar el pago. */
  accessAfterReject?: {
    status: string;
    canOperate: boolean;
    graceCause: string | null;
    accessEndsAt: Date | null;
    graceEndsAt: Date | null;
  };
}) {
  const inAppSent: Sent[] = [];
  const emailSent: Sent[] = [];

  const inApp: ReminderChannelAdapter = {
    channel: 'in_app',
    isEnabled: () => true,
    deliver: (recipient, message) => {
      if (options.inAppThrows) return Promise.reject(new Error('sin conexión'));
      inAppSent.push({ recipient, message });
      return Promise.resolve(true);
    },
  };

  const email: ReminderChannelAdapter = {
    channel: 'email',
    isEnabled: () => !options.emailDisabled,
    deliver: (recipient, message) => {
      emailSent.push({ recipient, message });
      return Promise.resolve(true);
    },
  };

  const companies = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        options.company === undefined
          ? { id: 7, name: 'Salón Bella', email: 'duena@salon.com', userId: 42 }
          : options.company,
      ),
  };

  const config = {
    get: (key: string) =>
      key === 'SUBSCRIPTION_PAY_LINK'
        ? 'https://app.clyps.co/suscripcion'
        : undefined,
  };

  // El acceso DESPUÉS del rechazo: es lo que decide si el mensaje anuncia
  // bloqueo o no. Por defecto, un salón que sigue operando.
  const entitlements = {
    getAccessState: jest.fn().mockResolvedValue(
      options.accessAfterReject ?? {
        status: 'grace',
        canOperate: true,
        graceCause: 'expired',
        accessEndsAt: new Date('2026-09-01T00:00:00.000Z'),
        graceEndsAt: new Date('2026-09-06T00:00:00.000Z'),
      },
    ),
  };

  const service = new PaymentOutcomeService(
    companies as unknown as Repository<Company>,
    config as unknown as ConfigService,
    entitlements as unknown as EntitlementsService,
    [inApp, email],
  );

  return { service, inAppSent, emailSent, companies, entitlements };
}

const activated: SubscriptionActivatedEvent = {
  companyId: 7,
  subscriptionId: 3,
  paymentReportId: 55,
  planId: 'full',
  previousPeriodEnd: null,
  newPeriodEnd: new Date('2026-10-19T14:56:08.000Z'),
};

const rejected: SubscriptionPaymentRejectedEvent = {
  companyId: 7,
  paymentReportId: 55,
  reason: 'No aparece el pago en la cuenta',
  reference: '0XREFERENCIA01',
};

describe('aviso de pago verificado', () => {
  it('sale por TODOS los canales encendidos, con la fecha de activación', async () => {
    const { service, inAppSent, emailSent } = buildService({});

    await service.onActivated(activated);

    expect(inAppSent).toHaveLength(1);
    expect(emailSent).toHaveLength(1);
    expect(inAppSent[0].message.title).toBe(
      'Plan Full activado hasta el 19/10/2026',
    );
    // El destinatario es el dueño del salón, no el admin que verificó.
    expect(inAppSent[0].recipient).toMatchObject({
      companyId: 7,
      userId: 42,
      email: 'duena@salon.com',
    });
  });

  it('un canal apagado no se intenta y el otro igual entrega', async () => {
    const { service, inAppSent, emailSent } = buildService({
      emailDisabled: true,
    });

    await service.onActivated(activated);

    expect(inAppSent).toHaveLength(1);
    expect(emailSent).toHaveLength(0);
  });

  it('sin plan elegido todavía, avisa con el de la prueba', async () => {
    const { service, inAppSent } = buildService({});

    await service.onActivated({ ...activated, planId: null });

    expect(inAppSent[0].message.title).toContain('Full');
  });
});

describe('aviso de pago rechazado', () => {
  it('lleva el motivo y a dónde reintentar', async () => {
    const { service, inAppSent } = buildService({});

    await service.onRejected(rejected);

    expect(inAppSent[0].message.title).toBe('No pudimos confirmar tu pago');
    expect(inAppSent[0].message.body).toContain(
      'No aparece el pago en la cuenta',
    );
    expect(inAppSent[0].message.actionUrl).toBe(
      'https://app.clyps.co/suscripcion',
    );
  });
});

describe('cuando la entrega falla', () => {
  it('un canal que revienta no tumba el aviso ni al resto', async () => {
    const { service, emailSent } = buildService({ inAppThrows: true });

    await expect(service.onActivated(activated)).resolves.toBeUndefined();
    // El correo salió igual.
    expect(emailSent).toHaveLength(1);
  });

  it('sin company no se avisa, pero tampoco se rompe', async () => {
    const { service, inAppSent, emailSent } = buildService({ company: null });

    await expect(service.onRejected(rejected)).resolves.toBeUndefined();
    expect(inAppSent).toHaveLength(0);
    expect(emailSent).toHaveLength(0);
  });
});

describe('el acceso después del rechazo', () => {
  it('si la gracia ya venció, el aviso dice que quedó bloqueado', async () => {
    // Mientras el reporte estaba en revisión seguía operando pese a la gracia
    // agotada (invariante de SUB-5). Al rechazarlo se le cae el acceso.
    const { service, inAppSent } = buildService({
      accessAfterReject: {
        status: 'blocked',
        canOperate: false,
        graceCause: null,
        accessEndsAt: new Date('2026-08-20T00:00:00.000Z'),
        graceEndsAt: new Date('2026-08-25T00:00:00.000Z'),
      },
    });

    await service.onRejected(rejected);

    expect(inAppSent[0].message.title).toContain('tu acceso quedó bloqueado');
    expect(inAppSent[0].message.body).toContain('Tu acceso quedó BLOQUEADO');
  });

  it('el estado se consulta al avisar, no se asume', async () => {
    const { service, entitlements } = buildService({});

    await service.onRejected(rejected);

    expect(entitlements.getAccessState).toHaveBeenCalledWith(7);
  });
});
