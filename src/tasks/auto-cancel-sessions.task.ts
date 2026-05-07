import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SessionService } from '../session/session.service';

@Injectable()
export class AutoCancelSessionsTask {
  private readonly logger = new Logger(AutoCancelSessionsTask.name);

  constructor(private readonly sessionService: SessionService) {}

  @Cron('5 12 * * *', {
    timeZone: 'America/Caracas',
  })
  async cancelExpiredScheduledSessions() {
    this.logger.log('⏰ Ejecutando auto-cancelación de citas agendadas vencidas...');
    try {
      const result = await this.sessionService.cancelExpiredScheduledSessions();
      if (result.cancelledSessions > 0) {
        this.logger.log(
          `✅ Auto-cancelación completada: ${result.cancelledSessions} sesión(es) y ${result.cancelledDetails} detalle(s)`,
        );
      } else {
        this.logger.log('ℹ️ No había citas agendadas vencidas para cancelar');
      }
    } catch (error) {
      this.logger.error(
        `❌ Error en auto-cancelación: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
