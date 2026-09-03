import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { PaymentReport } from '../entities/payment-report.entity';
import { COBRIX_DEFAULTS, CobrixConfig } from './cobrix.config';

/**
 * El respaldo de cuando el webhook no llega (SUB-10).
 *
 * Los webhooks se pierden: se cae la red, el túnel estaba abajo, Cobrix agotó
 * sus cuatro reintentos mientras estábamos desplegando. Depender solo de ellos
 * deja al tenant esperando para siempre una activación que nadie va a hacer.
 *
 * Así que un reporte que lleva demasiado en `pending` se ESCALA a la cola
 * manual (SUB-4): no se rechaza ni se verifica solo —de ese pago no sabemos
 * nada—, se le devuelve al admin con el motivo. Mientras tanto el tenant no se
 * bloquea: el reporte sigue en `reported` y un reporte pendiente concede acceso.
 *
 * Si el webhook llega tarde, después de escalar, igual se procesa: el servicio
 * del webhook busca reportes en `reported` y este sigue estándolo.
 */
@Injectable()
export class CobrixReconciliationService {
  private readonly logger = new Logger(CobrixReconciliationService.name);

  constructor(
    @InjectRepository(PaymentReport)
    private readonly reports: Repository<PaymentReport>,
    private readonly cobrix: CobrixConfig,
  ) {}

  /**
   * Manda a revisión manual los reportes que llevan más de `COBRIX_WEBHOOK_WAIT_HOURS`
   * esperando respuesta. Devuelve cuántos escaló.
   */
  async escalateStaleReports(now: Date = new Date()): Promise<number> {
    if (!this.cobrix.enabled) return 0;

    const waitHours = this.cobrix.waitHours;
    const cutoff = new Date(now.getTime() - waitHours * 60 * 60 * 1000);

    const stale = await this.reports.find({
      where: {
        status: 'reported',
        autoCheckStatus: 'pending',
        reportedAt: LessThan(cutoff),
      },
      // El que más lleva esperando, primero: es la misma cola con SLA de SUB-4.
      order: { reportedAt: 'ASC' },
      take: COBRIX_DEFAULTS.sweepBatch,
    });
    if (!stale.length) return 0;

    const reason = `Cobrix no respondió en ${waitHours} h: verificar a mano.`;
    for (const report of stale) {
      report.autoCheckStatus = 'expired';
      report.autoCheckAt = now;
      report.autoCheckReason = reason;
    }
    await this.reports.save(stale);

    this.logger.warn(
      `${stale.length} pago(s) sin respuesta de Cobrix tras ${waitHours} h: pasan a revisión manual.`,
    );
    return stale.length;
  }
}
