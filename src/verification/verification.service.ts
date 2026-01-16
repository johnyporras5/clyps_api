import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserVerificationCodes } from '../user-verification-codes/entities/user-verification-codes.entity';
import { User } from '../user/entities/user.entity';
import { MoreThan } from 'typeorm';

@Injectable()
export class VerificationService {
  constructor(
    @InjectRepository(UserVerificationCodes)
    private verificationCodeRepository: Repository<UserVerificationCodes>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
  ) { }

  /**
   * Obtener código de verificación activo para un usuario
   */
  async getActiveVerificationCode(userId: number): Promise<UserVerificationCodes | null> {
    const now = new Date();
    
    // Buscar códigos activos (no expirados y no usados) para este usuario
    const activeCode = await this.verificationCodeRepository.findOne({
      where: {
        userId,
        codeType: 'email_verification',
        used: 0,
        expiresAt: MoreThan(now) // Código no expirado
      },
      order: { expiresAt: 'DESC' } // Tomar el más reciente
    });

    return activeCode;
  }

  /**
   * Obtener estado del código de verificación
   */
  async getVerificationCodeStatus(userId: number): Promise<{ 
    hasActiveCode: boolean; 
    expiresAt?: Date; 
    secondsRemaining?: number;
  }> {
    const now = new Date();
    const activeCode = await this.verificationCodeRepository.findOne({
      where: {
        userId,
        codeType: 'email_verification',
        used: 0,
        expiresAt: MoreThan(now)
      },
    });

    if (!activeCode) {
      return { hasActiveCode: false };
    }

    const secondsRemaining = Math.floor((activeCode.expiresAt.getTime() - now.getTime()) / 1000);

    return {
      hasActiveCode: true,
      expiresAt: activeCode.expiresAt,
      secondsRemaining
    };
  }

  /**
   * Generar código de verificación de email
   */
  async generateVerificationCode(userId: number): Promise<string> {
    return this.generateCode(userId, 'email_verification');
  }

  /**
   * Generar código de reseteo de contraseña
   */
  async generatePasswordResetCode(userId: number): Promise<string> {
    return this.generateCode(userId, 'password_reset');
  }

  /**
   * Método privado para generar cualquier tipo de código
   */
  private async generateCode(userId: number, codeType: string): Promise<string> {
    await this.cleanupExpiredCodes();

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date();
    const expirationMinutes = parseInt(
      this.configService.get('VERIFICATION_CODE_EXPIRES_MINUTES') || '15'
    );
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);

    const verificationCode = this.verificationCodeRepository.create({
      userId,
      code,
      expiresAt,
      used: 0,
      codeType, // ✅ Agregar tipo de código
    });

    await this.verificationCodeRepository.save(verificationCode);

    console.log(`📧 Código de ${codeType} ${code} generado para usuario ${userId}, expira a las ${expiresAt.toLocaleTimeString()}`);

    return code;
  }

  /**
   * Verificar código de verificación de email
   */
  async verifyCode(email: string, code: string): Promise<boolean> {
    return this.verifyCodeByType(email, code, 'email_verification');
  }

  /**
   * Verificar código de reseteo de contraseña
   */
  async verifyPasswordResetCode(email: string, code: string): Promise<boolean> {
    return this.verifyCodeByType(email, code, 'password_reset');
  }

  /**
   * Método privado para verificar cualquier tipo de código
   */
  private async verifyCodeByType(email: string, code: string, codeType: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const verificationCode = await this.verificationCodeRepository.findOne({
      where: {
        userId: user.id,
        code,
        codeType, // ✅ Filtrar por tipo de código
        used: 0,
      },
      order: { id: 'DESC' },
    });

    if (!verificationCode) {
      // Verificar si existe un código expirado para este usuario
      const expiredCode = await this.verificationCodeRepository.findOne({
        where: {
          userId: user.id,
          code,
          codeType,
        },
        withDeleted: true,
      });

      if (expiredCode) {
        await this.verificationCodeRepository.delete(expiredCode.id);
        throw new BadRequestException('El código ha expirado');
      }

      throw new BadRequestException('Código inválido');
    }

    // Verificar expiración
    const now = new Date();
    console.log(`⏰ Verificando expiración: Ahora ${now}, Expira ${verificationCode.expiresAt}`);

    if (now > verificationCode.expiresAt) {
      await this.verificationCodeRepository.delete(verificationCode.id);
      throw new BadRequestException('El código ha expirado');
    }

    // Marcar como usado y eliminar
    verificationCode.used = 1;
    await this.verificationCodeRepository.save(verificationCode);
    await this.verificationCodeRepository.delete(verificationCode.id);

    // Si es código de verificación de email, actualizar estado del usuario
    if (codeType === 'email_verification') {
      user.emailVerified = 1;
      await this.userRepository.save(user);
    }

    console.log(`✅ Código de ${codeType} verificado exitosamente para ${email}`);
    return true;
  }

  /**
   * Verificar código por userId (para usar directamente desde AuthService)
   */
  async verifyCodeByUserId(userId: number, code: string, codeType: string): Promise<boolean> {
    const verificationCode = await this.verificationCodeRepository.findOne({
      where: {
        userId,
        code,
        codeType, // ✅ Filtrar por tipo de código
        used: 0,
      },
      order: { id: 'DESC' },
    });

    if (!verificationCode) {
      return false;
    }

    // Verificar expiración
    const now = new Date();
    if (now > verificationCode.expiresAt) {
      await this.verificationCodeRepository.delete(verificationCode.id);
      return false;
    }

    // Marcar como usado y eliminar
    verificationCode.used = 1;
    await this.verificationCodeRepository.save(verificationCode);
    await this.verificationCodeRepository.delete(verificationCode.id);

    return true;
  }

  async resendVerificationCode(email: string): Promise<string> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.emailVerified === 1) {
      throw new BadRequestException('El email ya está verificado');
    }

    await this.cleanupExpiredCodesForUser(user.id, 'email_verification');
    return await this.generateVerificationCode(user.id);
  }

  /**
   * Reenviar código de reseteo de contraseña
   */
  async resendPasswordResetCode(email: string): Promise<string> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    await this.cleanupExpiredCodesForUser(user.id, 'password_reset');
    return await this.generatePasswordResetCode(user.id);
  }

  async isValidCode(userId: number, code: string): Promise<boolean> {
    const verificationCode = await this.verificationCodeRepository.findOne({
      where: {
        userId,
        code,
        used: 0,
      },
    });

    if (!verificationCode) return false;

    if (new Date() > verificationCode.expiresAt) {
      await this.verificationCodeRepository.delete(verificationCode.id);
      return false;
    }

    return true;
  }

  async cleanupExpiredCodes(): Promise<number> {
    const now = new Date();
    const result = await this.verificationCodeRepository
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now', { now })
      .execute();

    const deletedCount = result.affected || 0;

    if (deletedCount > 0) {
      console.log(`🧹 Eliminados ${deletedCount} códigos expirados a las ${now.toLocaleTimeString()}`);
    }

    return deletedCount;
  }

  async cleanupExpiredCodesForUser(userId: number, codeType?: string): Promise<number> {
    const now = new Date();
    let query = this.verificationCodeRepository
      .createQueryBuilder()
      .delete()
      .where('user_id = :userId AND expires_at < :now', {
        userId,
        now
      });

    if (codeType) {
      query = query.andWhere('code_type = :codeType', { codeType });
    }

    const result = await query.execute();

    const deletedCount = result.affected || 0;

    if (deletedCount > 0) {
      console.log(`🧹 Eliminados ${deletedCount} códigos expirados para usuario ${userId}${codeType ? ` (tipo: ${codeType})` : ''}`);
    }

    return deletedCount;
  }

  async checkCodeStatus(email: string, code: string, codeType?: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      return { error: 'Usuario no encontrado' };
    }

    const whereClause: any = {
      userId: user.id,
      code,
    };

    if (codeType) {
      whereClause.codeType = codeType;
    }

    const verificationCode = await this.verificationCodeRepository.findOne({
      where: whereClause,
    });

    if (!verificationCode) {
      return { status: 'NO_EXISTE' };
    }

    const now = new Date();
    const isExpired = now > verificationCode.expiresAt;

    return {
      status: isExpired ? 'EXPIRADO' : 'ACTIVO',
      codeType: verificationCode.codeType,
      created: verificationCode.createdAt,
      expires: verificationCode.expiresAt,
      used: verificationCode.used,
      secondsRemaining: isExpired ? 0 : Math.floor((verificationCode.expiresAt.getTime() - now.getTime()) / 1000)
    };
  }
}