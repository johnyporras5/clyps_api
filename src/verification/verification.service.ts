import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../user/entities/user.entity';
import { UserVerificationCodesService } from '../user-verification-codes/user-verification-codes.service';

@Injectable()
export class VerificationService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private verificationCodesService: UserVerificationCodesService,
    private configService: ConfigService,
  ) {}

  async generateVerificationCode(userId: number, codeType: string = 'email_verification'): Promise<string> {
    await this.verificationCodesService.deleteExpiredCodesByUser(userId, codeType);
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    const expirationMinutes = parseInt(
      this.configService.get('VERIFICATION_CODE_EXPIRES_MINUTES') || '15'
    );
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);
    
    await this.verificationCodesService.create(userId, code, expiresAt, codeType);
    
    console.log(`📧 Código de ${codeType} ${code} generado para usuario ${userId}, expira a las ${expiresAt.toLocaleTimeString()}`);
    
    return code;
  }

  // ✅ AGREGAR ESTE MÉTODO FALTANTE
  async generatePasswordResetCode(userId: number): Promise<string> {
    return this.generateVerificationCode(userId, 'password_reset');
  }

  async verifyCodeByEmail(email: string, code: string, codeType: string = 'email_verification'): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    
    const verificationCode = await this.verificationCodesService.findCodeByUserIdAndCode(user.id, code, codeType);
    
    if (!verificationCode) {
      throw new BadRequestException('Código inválido');
    }
    
    // Verificar expiración
    const now = new Date();
    if (now > verificationCode.expiresAt) {
      await this.verificationCodesService.delete(verificationCode.id);
      throw new BadRequestException('El código ha expirado');
    }
    
    // Marcar como usado
    await this.verificationCodesService.markAsUsed(verificationCode.id);
    
    // Si es código de verificación de email, actualizar estado del usuario
    if (codeType === 'email_verification') {
      user.emailVerified = 1; // Usamos 1 para true
      await this.userRepository.save(user);
    }
    
    console.log(`✅ Código de ${codeType} verificado exitosamente para ${email}`);
    return true;
  }

  async verifyCode(email: string, code: string): Promise<boolean> {
    return this.verifyCodeByEmail(email, code, 'email_verification');
  }

  async verifyCodeByUserId(userId: number, code: string, codeType: string): Promise<boolean> {
    const verificationCode = await this.verificationCodesService.findCodeByUserIdAndCode(userId, code, codeType);
    
    if (!verificationCode) {
      return false;
    }
    
    // Verificar expiración
    const now = new Date();
    if (now > verificationCode.expiresAt) {
      await this.verificationCodesService.delete(verificationCode.id);
      return false;
    }
    
    // Marcar como usado
    await this.verificationCodesService.markAsUsed(verificationCode.id);
    
    // Si es código de verificación de email, actualizar estado del usuario
    if (codeType === 'email_verification') {
      await this.userRepository.update(userId, { emailVerified: 1 });
    }
    
    return true;
  }

  async getVerificationCodeStatus(userId: number): Promise<{ 
    hasActiveCode: boolean; 
    expiresAt?: Date; 
    secondsRemaining?: number;
  }> {
    return await this.verificationCodesService.getVerificationCodeStatus(userId);
  }

  async cleanupExpiredCodes(): Promise<number> {
    return await this.verificationCodesService.deleteExpiredCodes();
  }

  async cleanupExpiredCodesForUser(userId: number, codeType?: string): Promise<number> {
    return await this.verificationCodesService.deleteExpiredCodesByUser(userId, codeType);
  }
}