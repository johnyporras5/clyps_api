import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VerificationService } from '../verification/verification.service';
import { TokenBlacklistService } from '../auth/services/token_blacklist.service';

@Injectable()
export class CleanupTask {
  private readonly logger = new Logger(CleanupTask.name);

  constructor(
    private verificationService: VerificationService,
    private tokenBlacklistService: TokenBlacklistService,
  ) {}

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

  // ✅ Ejecutar cada 30 minutos para limpiar tokens expirados de la blacklist.
  // Antes esta limpieza solo ocurría al hacer logout; ahora es independiente.
  @Cron(CronExpression.EVERY_30_MINUTES)
  async cleanupExpiredBlacklistedTokens() {
    try {
      const clearedCount =
        await this.tokenBlacklistService.cleanupExpiredTokens();

      if (clearedCount > 0) {
        this.logger.log(
          `🧹 Limpiados ${clearedCount} tokens expirados de la blacklist`,
        );
      }
    } catch (error) {
      this.logger.error('Error limpiando tokens expirados:', error);
    }
  }

  // ✅ Ejecutar cada día a medianoche para limpieza general
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyCleanup() {
    this.logger.log('🏁 Iniciando limpieza diaria...');
    await this.cleanupExpiredVerificationCodes();
    await this.cleanupExpiredBlacklistedTokens();
  }
}
