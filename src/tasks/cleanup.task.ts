import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VerificationService } from '../verification/verification.service';

@Injectable()
export class CleanupTask {
  private readonly logger = new Logger(CleanupTask.name);

  constructor(private verificationService: VerificationService) {}

  // ✅ Ejecutar cada 30 minutos para limpiar códigos expirados
  @Cron(CronExpression.EVERY_30_MINUTES)
  async cleanupExpiredVerificationCodes() {
    try {
      const deletedCount = await this.verificationService.cleanupExpiredCodes();

      if (deletedCount > 0) {
        this.logger.log(
          `🧹 Eliminados ${deletedCount} códigos de verificación expirados`,
        );
      }
    } catch (error) {
      this.logger.error('Error limpiando códigos expirados:', error);
    }
  }

  // ✅ Ejecutar cada día a medianoche para limpieza general
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyCleanup() {
    this.logger.log('🏁 Iniciando limpieza diaria de códigos...');
    await this.cleanupExpiredVerificationCodes();
  }
}
