import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThanOrEqual } from 'typeorm'; // ✅ Agregar IsNull y MoreThanOrEqual
import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { BlacklistedToken } from '../entities/blacklisted_token.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokenBlacklistService {
  constructor(
    @InjectRepository(BlacklistedToken)
    private blacklistedTokenRepository: Repository<BlacklistedToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Calcula el hash SHA-256 de un token. Nunca almacenamos el JWT completo en
   * texto plano: si la tabla se filtra, los hashes no son reutilizables.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Agregar token a la blacklist
   */
  async addToBlacklist(
    token: string,
    userId?: number,
    reason?: string,
  ): Promise<BlacklistedToken> {
    // Guardamos el hash del token, nunca el token en texto plano.
    const tokenHash = this.hashToken(token);
    try {
      // Decodificar el token para obtener su expiración
      const decoded = this.jwtService.decode(token);
      const expiresAt = decoded?.exp
        ? decoded.exp * 1000
        : Date.now() + 24 * 60 * 60 * 1000; // Default 24h

      // Crear registro en blacklist
      const blacklistedToken = this.blacklistedTokenRepository.create({
        token: tokenHash,
        expiresAt,
        userId,
        reason: reason || 'logout',
      });

      return await this.blacklistedTokenRepository.save(blacklistedToken);
    } catch (error) {
      // Si no se puede decodificar, usar expiración por defecto
      const blacklistedToken = this.blacklistedTokenRepository.create({
        token: tokenHash,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 horas por defecto
        userId,
        reason: reason || 'logout',
      });

      return await this.blacklistedTokenRepository.save(blacklistedToken);
    }
  }

  /**
   * Verificar si un token está en la blacklist
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    const found = await this.blacklistedTokenRepository.findOne({
      where: {
        token: this.hashToken(token),
        clearedAt: IsNull(), // ✅ Cambiar null por IsNull()
      },
    });

    return !!found;
  }

  /**
   * Obtener todos los tokens blacklisted de un usuario
   */
  async getUserBlacklistedTokens(userId: number): Promise<BlacklistedToken[]> {
    return await this.blacklistedTokenRepository.find({
      where: {
        userId,
        clearedAt: IsNull(), // ✅ Cambiar null por IsNull()
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Limpiar tokens expirados
   */
  async cleanupExpiredTokens(): Promise<number> {
    const now = Date.now();

    const result = await this.blacklistedTokenRepository
      .createQueryBuilder()
      .update(BlacklistedToken)
      .set({ clearedAt: new Date() })
      .where('expiresAt < :now AND clearedAt IS NULL', { now })
      .execute();

    return result.affected || 0;
  }

  /**
   * Forzar logout de un usuario (invalidar todos sus tokens)
   */
  async forceLogoutUser(
    userId: number,
    reason: string = 'force_logout',
  ): Promise<number> {
    const result = await this.blacklistedTokenRepository
      .createQueryBuilder()
      .update(BlacklistedToken)
      .set({
        clearedAt: new Date(),
        reason,
      })
      .where('userId = :userId AND clearedAt IS NULL', { userId })
      .execute();

    return result.affected || 0;
  }

  /**
   * Extraer token del header Authorization
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Decodificar token para obtener información
   */
  decodeToken(token: string): any {
    try {
      const secret = this.configService.get('JWT_SECRET');
      return jwt.verify(token, secret);
    } catch (error) {
      return this.jwtService.decode(token);
    }
  }

  /**
   * Obtener tokens activos (no expirados) de un usuario
   */
  async getActiveBlacklistedTokens(
    userId: number,
  ): Promise<BlacklistedToken[]> {
    const now = Date.now();

    return await this.blacklistedTokenRepository.find({
      where: {
        userId,
        expiresAt: MoreThanOrEqual(now), // ✅ Usar MoreThanOrEqual para tokens no expirados
        clearedAt: IsNull(),
      },
      order: { expiresAt: 'DESC' },
    });
  }
}
