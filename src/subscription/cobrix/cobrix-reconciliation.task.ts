import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CobrixReconciliationService } from './cobrix-reconciliation.service';

/**
 * Barrido de los pagos que se quedaron esperando el webhook de Cobrix (SUB-10).
 *
 * Cada 15 minutos, que es más fino que la ventana de espera (horas) y más
 * grueso que los reintentos de Cobrix (5 min, 30 min, 2 h, 24 h): así nunca
 * escala un pago que todavía tiene entregas por llegar.
 */
@Injectable()
export class CobrixReconciliationTask {
  private readonly logger = new Logger(CobrixReconciliationTask.name);

  constructor(private readonly reconciliation: CobrixReconciliationService) {}

  @Cron('*/15 * * * *')
  async sweep(): Promise<void> {
    try {
      const escalated = await this.reconciliation.escalateStaleReports();
      if (escalated > 0)
        this.logger.log(
          `⏰ ${escalated} pago(s) escalado(s) a verificación manual.`,
        );
    } catch (error) {
      this.logger.error(
        `❌ Error conciliando pagos con Cobrix: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
