import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../user/entities/user.entity';
import { RegisterBaseDto } from './dto/register-base.dto';
import { LoginDto } from './dto/login.dto';
import { Worker } from '../worker/entities/worker.entity'; 
import { RegisterWorkerDto } from './dto/register-worker.dto';
import { Client } from '../client/entities/client.entity'; 
import { RegisterClientDto } from './dto/register-client.dto'; 
import { EmailService } from '../email/email.service';
import { VerificationService } from '../verification/verification.service';
import { TokenBlacklistService } from './services/token_blacklist.service'; 

// Importar todos los DTOs de cambio de contraseña
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestPasswordResetDto, ResetPasswordDto, VerifyResetCodeDto } from './dto/reset-password.dto';
import { ChangePasswordWithoutAuthDto } from './dto/change-password-without-auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    @InjectRepository(Client) 
    private clientRepository: Repository<Client>,
    private jwtService: JwtService,
    private emailService: EmailService,
    private verificationService: VerificationService,
    private tokenBlacklistService: TokenBlacklistService,
  ) {}

  // ==================== MÉTODOS DE REGISTRO ====================

  /**
   * Registro específico para administradores
   */
  async registerAdmin(registerDto: RegisterBaseDto): Promise<{ 
    message: string; 
    user: Partial<User>;
    access_token?: string;
  }> {
    // Verificar si el email ya existe
    const existingUserByEmail = await this.userRepository.findOne({
      where: { email: registerDto.email }
    });

    if (existingUserByEmail) {
      // Si el usuario existe pero no está verificado, permitir reenviar código
      if (existingUserByEmail.emailVerified === 0) {
        await this.sendVerificationCode(registerDto.email);
        throw new ConflictException({
          message: 'El email ya está registrado pero no verificado. Se ha enviado un nuevo código de verificación.',
          requiresVerification: true,
          userId: existingUserByEmail.id,
        });
      }
      throw new ConflictException('El email ya está registrado');
    }

    // Verificar si el username ya existe
    const existingUserByUsername = await this.userRepository.findOne({
      where: { username: registerDto.username }
    });

    if (existingUserByUsername) {
      throw new ConflictException('El nombre de usuario ya está en uso');
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Crear usuario
    const user = this.userRepository.create({
      username: registerDto.username,
      email: registerDto.email,
      password: hashedPassword,
      userType: 'adm',
      emailVerified: 0,
    });

    await this.userRepository.save(user);

    // Enviar código de verificación
    await this.sendVerificationCode(user.email);

    // Generar token JWT
    const payload = {
      email: user.email,
      sub: user.id,
      userType: user.userType
    };

    const access_token = this.jwtService.sign(payload);

    // Eliminar password del objeto de respuesta
    const { password, ...userWithoutPassword } = user;

    return {
      message: 'Administrador registrado exitosamente. Por favor verifica tu email.',
      user: userWithoutPassword,
      access_token
    };
  }

  /**
   * Registro específico para trabajadores
   */
  async registerWorker(registerDto: RegisterWorkerDto): Promise<{ 
    message: string; 
    user: Partial<User>;
    access_token?: string;
  }> {
    // Verificar si el email ya existe
    const existingUserByEmail = await this.userRepository.findOne({
      where: { email: registerDto.email }
    });

    if (existingUserByEmail) {
      // Si el usuario existe pero no está verificado, permitir reenviar código
      if (existingUserByEmail.emailVerified === 0) {
        await this.sendVerificationCode(registerDto.email);
        throw new ConflictException({
          message: 'El email ya está registrado pero no verificado. Se ha enviado un nuevo código de verificación.',
          requiresVerification: true,
          userId: existingUserByEmail.id,
        });
      }
      throw new ConflictException('El email ya está registrado');
    }

    // Verificar si el username ya existe
    const existingUserByUsername = await this.userRepository.findOne({
      where: { username: registerDto.username }
    });

    if (existingUserByUsername) {
      throw new ConflictException('El nombre de usuario ya está en uso');
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Crear usuario
    const user = this.userRepository.create({
      username: registerDto.username,
      email: registerDto.email,
      password: hashedPassword,
      userType: 'wrk',
      emailVerified: 0,
    });

    const savedUser = await this.userRepository.save(user);

    // Crear perfil de worker
    const worker = this.workerRepository.create({
      name: registerDto.name,
      lastName: registerDto.lastName,
      address: registerDto.address,
      birthdate: registerDto.birthdate,
      picture: registerDto.picture,
      description: registerDto.description,
      userId: savedUser.id
    });

    await this.workerRepository.save(worker);

    // Enviar código de verificación
    await this.sendVerificationCode(user.email);

    // Generar token JWT
    const payload = {
      email: user.email,
      sub: user.id,
      userType: user.userType
    };

    const access_token = this.jwtService.sign(payload);

    // Eliminar password del objeto de respuesta
    const { password, ...userWithoutPassword } = user;

    return {
      message: 'Trabajador registrado exitosamente. Por favor verifica tu email.',
      user: userWithoutPassword,
      access_token
    };
  }

  /**
   * Registro específico para clientes
   */
  async registerClient(registerDto: RegisterClientDto): Promise<{ 
    message: string; 
    user: Partial<User>;
    access_token?: string;
  }> {
    // Verificar si el email ya existe
    const existingUserByEmail = await this.userRepository.findOne({
      where: { email: registerDto.email }
    });

    if (existingUserByEmail) {
      // Si el usuario existe pero no está verificado, permitir reenviar código
      if (existingUserByEmail.emailVerified === 0) {
        await this.sendVerificationCode(registerDto.email);
        throw new ConflictException({
          message: 'El email ya está registrado pero no verificado. Se ha enviado un nuevo código de verificación.',
          requiresVerification: true,
          userId: existingUserByEmail.id,
        });
      }
      throw new ConflictException('El email ya está registrado');
    }

    // Verificar si el username ya existe
    const existingUserByUsername = await this.userRepository.findOne({
      where: { username: registerDto.username }
    });

    if (existingUserByUsername) {
      throw new ConflictException('El nombre de usuario ya está en uso');
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Crear usuario
    const user = this.userRepository.create({
      username: registerDto.username,
      email: registerDto.email,
      password: hashedPassword,
      userType: 'cli',
      emailVerified: 0,
    });

    const savedUser = await this.userRepository.save(user);

    // Crear perfil de client
    const client = this.clientRepository.create({
      name: registerDto.name,
      lastName: registerDto.lastName,
      email: registerDto.email,
      location: registerDto.location,
      userId: savedUser.id
    });

    await this.clientRepository.save(client);

    // Enviar código de verificación
    await this.sendVerificationCode(user.email);

    // Generar token JWT
    const payload = {
      email: user.email,
      sub: user.id,
      userType: user.userType
    };

    const access_token = this.jwtService.sign(payload);

    // Eliminar password del objeto de respuesta
    const { password, ...userWithoutPassword } = user;

    return {
      message: 'Cliente registrado exitosamente. Por favor verifica tu email.',
      user: userWithoutPassword,
      access_token
    };
  }

  // ==================== MÉTODOS DE LOGIN ====================

  async login(loginDto: LoginDto): Promise<{ access_token: string; user: Partial<User> }> {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email }
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Primero verificamos si la contraseña es válida
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Si el usuario no está verificado
    if (user.emailVerified === 0) {
      // Verificar si ya hay un código activo
      const codeStatus = await this.verificationService.getVerificationCodeStatus(user.id);

      if (codeStatus.hasActiveCode && codeStatus.secondsRemaining) {
        // Si ya tiene código activo, calcular minutos restantes
        const minutesRemaining = Math.ceil(codeStatus.secondsRemaining / 60);

        throw new UnauthorizedException({
          message: `Por favor verifica tu email antes de iniciar sesión. Ya tienes un código activo (expira en ${minutesRemaining} minutos). Revisa tu correo.`,
          requiresVerification: true,
          userId: user.id,
          hasActiveCode: true,
          secondsRemaining: codeStatus.secondsRemaining,
          minutesRemaining
        });
      } else {
        // Si no tiene código activo, enviar uno nuevo
        try {
          // Enviar código de verificación automáticamente
          await this.sendVerificationCode(loginDto.email);

          // Lanzamos excepción con mensaje informativo
          throw new UnauthorizedException({
            message: 'Por favor verifica tu email antes de iniciar sesión. Se ha enviado un nuevo código de verificación a tu correo.',
            requiresVerification: true,
            userId: user.id
          });
        } catch (error) {
          // Si hay error específico al enviar, usamos mensaje diferente
          if (error instanceof BadRequestException || error instanceof NotFoundException) {
            throw new UnauthorizedException({
              message: 'Por favor verifica tu email antes de iniciar sesión.',
              requiresVerification: true,
              userId: user.id
            });
          }
          // Si es la excepción que lanzamos nosotros, la propagamos
          if (error instanceof UnauthorizedException) {
            throw error;
          }
          // Cualquier otro error
          throw new UnauthorizedException({
            message: 'Por favor verifica tu email antes de iniciar sesión.',
            requiresVerification: true,
            userId: user.id
          });
        }
      }
    }

    // Actualizar lastLogin del usuario
    user.lastLogin = new Date();
    await this.userRepository.save(user);

    const payload = {
      email: user.email,
      sub: user.id,
      userType: user.userType
    };

    const access_token = this.jwtService.sign(payload);

    const { password, ...userWithoutPassword } = user;

    return {
      access_token,
      user: userWithoutPassword,
    };
  }

  // ==================== MÉTODOS DE VERIFICACIÓN ====================

  /**
   * Método separado para enviar código de verificación
   * Se puede usar en registro y de forma independiente
   */
  async sendVerificationCode(email: string): Promise<{ message: string; userId: number }> {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Si ya está verificado, no enviar código
    if (user.emailVerified === 1) {
      throw new BadRequestException('El email ya está verificado');
    }

    // Primero, verificar si ya existe un código activo
    const codeStatus = await this.verificationService.getVerificationCodeStatus(user.id);

    if (codeStatus.hasActiveCode && codeStatus.secondsRemaining) {
      const minutesRemaining = Math.ceil(codeStatus.secondsRemaining / 60);

      return {
        message: `Ya tienes un código de verificación activo (expira en ${minutesRemaining} minutos). Revisa tu bandeja de entrada.`,
        userId: user.id,
      };
    }

    // Si no hay código activo, generar uno nuevo
    const code = await this.verificationService.generateVerificationCode(user.id);
    const emailSent = await this.emailService.sendVerificationCode(user.email, code, user.username);

    if (!emailSent) {
      console.warn('No se pudo enviar el email de verificación');
      throw new BadRequestException('No se pudo enviar el código de verificación');
    }

    return {
      message: 'Código de verificación enviado a tu email. Por favor, revisa tu bandeja de entrada.',
      userId: user.id,
    };
  }

  async verifyEmail(email: string, code: string): Promise<{ message: string }> {
    const success = await this.verificationService.verifyCode(email, code);

    if (success) {
      return { message: 'Email verificado correctamente. Ahora puedes iniciar sesión.' };
    }

    throw new BadRequestException('Error al verificar el email');
  }

  async resendVerificationCode(email: string): Promise<{ message: string }> {
    // Usar el método separado para reenviar código
    const result = await this.sendVerificationCode(email);
    return { message: result.message };
  }

  /**
   * Método para verificar si un usuario existe y su estado
   */
  async checkUserStatus(email: string): Promise<{ exists: boolean; verified: boolean; userId?: number }> {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      return { exists: false, verified: false };
    }

    return {
      exists: true,
      verified: user.emailVerified === 1,
      userId: user.id
    };
  }

  // ==================== MÉTODOS DE CAMBIO Y RESETEO DE CONTRASEÑA ====================

  /**
   * Cambiar contraseña (usuario autenticado)
   */
  async changePassword(userId: number, changePasswordDto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar contraseña actual
    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    // Verificar que las nuevas contraseñas coincidan
    if (changePasswordDto.newPassword !== changePasswordDto.confirmNewPassword) {
      throw new BadRequestException('Las nuevas contraseñas no coinciden');
    }

    // Verificar que la nueva contraseña no sea igual a la actual
    const isSamePassword = await bcrypt.compare(
      changePasswordDto.newPassword,
      user.password
    );

    if (isSamePassword) {
      throw new BadRequestException('La nueva contraseña debe ser diferente a la actual');
    }

    // Encriptar nueva contraseña
    const hashedNewPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);

    // Actualizar contraseña
    user.password = hashedNewPassword;
    await this.userRepository.save(user);

    // Enviar email de notificación
    try {
      await this.emailService.sendPasswordChangedNotification(
        user.email,
        user.username
      );
    } catch (error) {
      console.warn('No se pudo enviar email de notificación:', error.message);
    }

    return { message: 'Contraseña cambiada exitosamente' };
  }

  async requestPasswordReset(requestPasswordResetDto: RequestPasswordResetDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: requestPasswordResetDto.email }
    });

    // Verificar explícitamente si el usuario existe
    if (!user) {
      throw new NotFoundException('No existe un usuario registrado con este email');
    }

    // Verificar si el email está verificado (opcional, dependiendo de tus requisitos)
    if (user.emailVerified === 0) {
      throw new BadRequestException('Por favor verifica tu email antes de solicitar un reseteo de contraseña');
    }

    // Generar código de reseteo
    const code = await this.verificationService.generatePasswordResetCode(user.id);

    // Enviar email con el código
    const emailSent = await this.emailService.sendPasswordResetCode(
      user.email,
      code,
      user.username
    );

    if (!emailSent) {
      console.warn('No se pudo enviar email de reseteo de contraseña');
      throw new BadRequestException('No se pudo enviar el código de reseteo de contraseña');
    }

    return {
      message: 'Se ha enviado un código de restablecimiento de contraseña a tu email'
    };
  }

  /**
   * Verificar código de reseteo de contraseña
   */
  async verifyResetCode(verifyResetCodeDto: VerifyResetCodeDto): Promise<{ message: string; valid: boolean }> {
    const user = await this.userRepository.findOne({
      where: { email: verifyResetCodeDto.email }
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const isValid = await this.verificationService.verifyCodeByUserId(
      user.id,
      verifyResetCodeDto.code,
      'password_reset'
    );

    if (isValid) {
      return {
        message: 'Código válido. Puedes proceder a cambiar tu contraseña.',
        valid: true
      };
    }

    return {
      message: 'Código inválido o expirado',
      valid: false
    };
  }

  /**
   * Resetear contraseña usando código
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: resetPasswordDto.email }
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar que el código sea válido
    const isValid = await this.verificationService.verifyCodeByUserId(
      user.id,
      resetPasswordDto.code,
      'password_reset'
    );

    if (!isValid) {
      throw new BadRequestException('Código inválido o expirado');
    }

    // Encriptar nueva contraseña
    const hashedNewPassword = await bcrypt.hash(resetPasswordDto.newPassword, 10);

    // Actualizar contraseña
    user.password = hashedNewPassword;
    await this.userRepository.save(user);

    // Enviar email de confirmación
    try {
      await this.emailService.sendPasswordChangedNotification(user.email, user.username);
    } catch (error) {
      console.warn('No se pudo enviar email de notificación:', error.message);
    }

    return { message: 'Contraseña restablecida exitosamente' };
  }

  /**
   * Logout - Invalidar token actual
   */
  async logout(authHeader: string, userId: number): Promise<{ message: string }> {
    const token = this.tokenBlacklistService.extractTokenFromHeader(authHeader);

    if (!token) {
      throw new BadRequestException('Token no proporcionado');
    }

    // Agregar token a la blacklist
    await this.tokenBlacklistService.addToBlacklist(token, userId, 'logout');

    // Actualizar lastLogout del usuario
    await this.userRepository.update(userId, {
      lastLogout: new Date(),
    });

    // Opcional: Limpiar tokens expirados periódicamente
    await this.tokenBlacklistService.cleanupExpiredTokens();

    return { message: 'Sesión cerrada exitosamente' };
  }

  /**
   * Forzar logout de todos los dispositivos
   */
  async forceLogoutAllDevices(userId: number): Promise<{ message: string }> {
    // Invalidar todos los tokens del usuario
    const invalidated = await this.tokenBlacklistService.forceLogoutUser(userId, 'force_logout');

    // Actualizar lastLogout
    await this.userRepository.update(userId, {
      lastLogout: new Date(),
    });

    return {
      message: `Sesiones cerradas exitosamente. ${invalidated} tokens invalidados.`
    };
  }

  /**
   * Cambiar contraseña sin autenticación (usando código de verificación)
   * Para usuarios que olvidaron su contraseña
   */
  async changePasswordWithoutAuth(
    changePasswordDto: ChangePasswordWithoutAuthDto
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ 
      where: { email: changePasswordDto.email } 
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar que las nuevas contraseñas coincidan
    if (changePasswordDto.newPassword !== changePasswordDto.confirmNewPassword) {
      throw new BadRequestException('Las nuevas contraseñas no coinciden');
    }

    // Verificar que la nueva contraseña no sea igual a la anterior
    const isSamePassword = await bcrypt.compare(
      changePasswordDto.newPassword,
      user.password
    );

    if (isSamePassword) {
      throw new BadRequestException('La nueva contraseña debe ser diferente a la anterior');
    }

    // Encriptar nueva contraseña
    const hashedNewPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);

    // Actualizar contraseña
    user.password = hashedNewPassword;
    await this.userRepository.save(user);

    // Enviar email de notificación
    try {
      await this.emailService.sendPasswordChangedNotification(
        user.email,
        user.username
      );
    } catch (error) {
      console.warn('No se pudo enviar email de notificación:', error.message);
    }

    return { message: 'Contraseña cambiada exitosamente' };
  }

  // ==================== MÉTODOS ADICIONALES (DE TU CÓDIGO ORIGINAL) ====================

  /**
   * Verificar si un email ya existe
   */
  async checkEmailExists(email: string): Promise<{ exists: boolean }> {
    const user = await this.userRepository.findOne({ where: { email } });
    return { exists: !!user };
  }

  /**
   * Verificar si un username ya existe
   */
  async checkUsernameExists(username: string): Promise<{ exists: boolean }> {
    const user = await this.userRepository.findOne({ where: { username } });
    return { exists: !!user };
  }

  /**
   * Verificar si un token está en blacklist (útil para pruebas)
   */
  async isTokenBlacklisted(token: string): Promise<{ isBlacklisted: boolean }> {
    const isBlacklisted = await this.tokenBlacklistService.isTokenBlacklisted(token);
    return { isBlacklisted };
  }

  /**
   * Limpiar tokens expirados automáticamente
   */
  async cleanupExpiredTokens(): Promise<{ message: string }> {
    const count = await this.tokenBlacklistService.cleanupExpiredTokens();
    return { 
      message: `Se han limpiado ${count} tokens expirados` 
    };
  }
}