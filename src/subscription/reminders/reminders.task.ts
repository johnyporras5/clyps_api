import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RemindersService } from './reminders.service';

/**
 * El job diario de recordatorios de cobro (SUB-8 / CLYP-339).
 *
 * A las 9 de la mañana de Caracas, como el resto de los avisos del producto: un
 * recordatorio de pago a las 3 AM se lee tarde y molesta.
 *
 * Una sola corrida al día basta porque los offsets se cuentan en días de
 * calendario, y la bitácora impide que dos corridas manden lo mismo.
 */
@Injectable()
export class RemindersTask {
  private readonly logger = new Logger(RemindersTask.name);

  constructor(private readonly reminders: RemindersService) {}

  @Cron('0 9 * * *', { timeZone: 'America/Caracas' })
  async sweep(): Promise<void> {
    try {
      const sent = await this.reminders.sweep();
      if (sent > 0)
        this.logger.log(`📣 ${sent} recordatorio(s) de cobro enviado(s).`);
    } catch (error) {
      this.logger.error(
        `❌ Error en el barrido de recordatorios: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
