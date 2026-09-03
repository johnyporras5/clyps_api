import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { PaymentReport } from '../entities/payment-report.entity';
import { CobrixConfig } from './cobrix.config';
import { CobrixReconciliationService } from './cobrix-reconciliation.service';

/**
 * El criterio "si el webhook no llega, nunca se queda colgado": pasado el
 * tiempo de espera el pago cae al respaldo manual (SUB-4), sin rechazarse y sin
 * bloquear al tenant.
 */

const NOW = new Date('2026-09-03T12:00:00.000Z');

function reportFixture(overrides: Partial<PaymentReport> = {}): PaymentReport {
  const report = new PaymentReport();
  Object.assign(report, {
    id: 1,
    companyId: 7,
    status: 'reported',
    autoCheckStatus: 'pending',
    autoCheckAt: new Date('2026-09-03T02:00:00.000Z'),
    autoCheckReason: null,
    reportedAt: new Date('2026-09-03T02:00:00.000Z'),
    ...overrides,
  });
  return report;
}

function buildService(
  options: { stale?: PaymentReport[]; secret?: string } = {},
) {
  const reports = {
    find: jest.fn().mockResolvedValue(options.stale ?? []),
    save: jest.fn().mockImplementation((rows: PaymentReport[]) => rows),
  };
  // La conciliación solo corre con Cobrix configurado del todo: hace falta la
  // llave (para emitir el cobro) y el secreto (para verificar el webhook).
  const config = new CobrixConfig({
    get: (key: string) => {
      if (key === 'COBRIX_WEBHOOK_SECRET')
        return options.secret ?? 'whsec_de_prueba';
      if (key === 'COBRIX_API_KEY') return options.secret ?? 'cbx_live_prueba';
      return undefined;
    },
  } as unknown as ConfigService);

  const service = new CobrixReconciliationService(
    reports as unknown as Repository<PaymentReport>,
    config,
  );
  return { service, reports };
}

describe('conciliación cuando el webhook no llega', () => {
  it('escala a revisión manual los pagos que llevan horas esperando', async () => {
    const stale = reportFixture();
    const { service, reports } = buildService({ stale: [stale] });

    const escalated = await service.escalateStaleReports(NOW);

    expect(escalated).toBe(1);
    expect(stale.autoCheckStatus).toBe('expired');
    expect(stale.autoCheckReason).toContain('Cobrix no respondió');
    // Sigue siendo un reclamo pendiente: no se rechaza y el tenant no pierde
    // el acceso por esperar (SUB-5).
    expect(stale.status).toBe('reported');
    expect(reports.save).toHaveBeenCalledWith([stale]);
  });

  it('solo mira los que están esperando a Cobrix y son viejos', async () => {
    const { service, reports } = buildService();

    await service.escalateStaleReports(NOW);

    const calls = reports.find.mock.calls as unknown as unknown[][];
    const { where } = calls[0][0] as { where: Record<string, unknown> };
    expect(where.status).toBe('reported');
    expect(where.autoCheckStatus).toBe('pending');
    expect(where.reportedAt).toBeDefined();
  });

  it('no hace nada si no hay nada que escalar', async () => {
    const { service, reports } = buildService({ stale: [] });

    expect(await service.escalateStaleReports(NOW)).toBe(0);
    expect(reports.save).not.toHaveBeenCalled();
  });

  it('con Cobrix apagado no toca ningún reporte', async () => {
    const { service, reports } = buildService({ secret: '' });

    expect(await service.escalateStaleReports(NOW)).toBe(0);
    expect(reports.find).not.toHaveBeenCalled();
  });
});
