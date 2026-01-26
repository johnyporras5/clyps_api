import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  Get, 
  Param,
  Query,
  UseGuards,
  Req,
  Headers,
  Patch
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterBaseDto } from './dto/register-base.dto';
import { RegisterWorkerDto } from './dto/register-worker.dto';
import { RegisterClientDto } from './dto/register-client.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TokenBlacklistService } from './services/token_blacklist.service'; 

// Importar DTOs de cambio de contraseña
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestPasswordResetDto, ResetPasswordDto, VerifyResetCodeDto } from './dto/reset-password.dto';
import { ChangePasswordWithoutAuthDto } from './dto/change-password-without-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  // ==================== ENDPOINTS DE REGISTRO ====================

  /**
   * Registro para administradores
   * POST /auth/register/admin
   */
  @Post('register/admin')
  @HttpCode(HttpStatus.CREATED)
  async registerAdmin(@Body() registerDto: RegisterBaseDto) {
    return this.authService.registerAdmin(registerDto);
  }

  /**
   * Registro para trabajadores
   * POST /auth/register/worker
   */
  @Post('register/worker')
  @UseGuards(JwtAuthGuard) // Proteger el endpoint
  @HttpCode(HttpStatus.CREATED)
  async registerWorker(
    @Body() registerDto: RegisterWorkerDto,
    @Req() req: any // Para obtener el admin autenticado
  ) {
    const adminId = req.user.sub; // ID del administrador autenticado
    return this.authService.registerWorker(registerDto, adminId);
  }

  /**
   * Registro para clientes
   * POST /auth/register/client
   */
  @Post('register/client')
  @HttpCode(HttpStatus.CREATED)
  async registerClient(@Body() registerDto: RegisterClientDto) {
    return this.authService.registerClient(registerDto);
  }

  // ==================== ENDPOINTS DE LOGIN ====================

  /**
   * Login para todos los tipos de usuarios
   * POST /auth/login
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // ==================== ENDPOINTS DE VERIFICACIÓN DE EMAIL ====================

  /**
   * Enviar código de verificación
   * POST /auth/send-verification-code
   */
  @Post('send-verification-code')
  @HttpCode(HttpStatus.OK)
  async sendVerificationCode(@Body() body: { email: string }) {
    return this.authService.sendVerificationCode(body.email);
  }

  /**
   * Verificar email con código
   * POST /auth/verify-email
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() body: { email: string; code: string }) {
    return this.authService.verifyEmail(body.email, body.code);
  }

  /**
   * Reenviar código de verificación
   * POST /auth/resend-verification-code
   */
  @Post('resend-verification-code')
  @HttpCode(HttpStatus.OK)
  async resendVerificationCode(@Body() body: { email: string }) {
    return this.authService.resendVerificationCode(body.email);
  }

  // ==================== ENDPOINTS DE VERIFICACIÓN DE DISPONIBILIDAD ====================

  /**
   * Verificar si email existe
   * GET /auth/check-email/:email
   */
  @Get('check-email/:email')
  async checkEmailExists(@Param('email') email: string) {
    return this.authService.checkEmailExists(email);
  }

  /**
   * Verificar si username existe
   * GET /auth/check-username/:username
   */
  @Get('check-username/:username')
  async checkUsernameExists(@Param('username') username: string) {
    return this.authService.checkUsernameExists(username);
  }

  // ==================== ENDPOINTS DE ESTADO DEL USUARIO ====================

  /**
   * Verificar estado del usuario
   * GET /auth/user-status
   */
  @Get('user-status')
  async checkUserStatus(@Query('email') email: string) {
    return this.authService.checkUserStatus(email);
  }

  /**
   * Verificar si un email existe y está verificado
   * GET /auth/check-email-verified/:email
   */
  @Get('check-email-verified/:email')
  async checkEmailVerified(@Param('email') email: string) {
    const result = await this.authService.checkUserStatus(email);
    return {
      email,
      exists: result.exists,
      verified: result.verified,
      userId: result.userId
    };
  }

  // ==================== ENDPOINTS DE CAMBIO DE CONTRASEÑA ====================

  /**
   * Cambiar contraseña (usuario autenticado)
   * PATCH /auth/change-password
   */
  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Req() req: any,
    @Body() changePasswordDto: ChangePasswordDto
  ) {
    const userId = req.user.sub;
    return this.authService.changePassword(userId, changePasswordDto);
  }

  /**
   * Solicitar reseteo de contraseña
   * POST /auth/request-password-reset
   */
  @Post('request-password-reset')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() requestPasswordResetDto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(requestPasswordResetDto);
  }

  /**
   * Verificar código de reseteo de contraseña
   * POST /auth/verify-reset-code
   */
  @Post('verify-reset-code')
  @HttpCode(HttpStatus.OK)
  async verifyResetCode(@Body() verifyResetCodeDto: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(verifyResetCodeDto);
  }

  /**
   * Resetear contraseña usando código
   * POST /auth/reset-password
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  /**
   * Cambiar contraseña sin autenticación
   * POST /auth/change-password-without-auth
   */
  @Post('change-password-without-auth')
  @HttpCode(HttpStatus.OK)
  async changePasswordWithoutAuth(@Body() changePasswordDto: ChangePasswordWithoutAuthDto) {
    return this.authService.changePasswordWithoutAuth(changePasswordDto);
  }

  // ==================== ENDPOINTS DE LOGOUT ====================

  /**
   * Cerrar sesión
   * POST /auth/logout
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Headers('authorization') authHeader: string,
    @Req() req: any
  ) {
    const userId = req.user.sub;
    return this.authService.logout(authHeader, userId);
  }

  /**
   * Cerrar sesión en todos los dispositivos
   * POST /auth/logout-all
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async forceLogoutAllDevices(@Req() req: any) {
    const userId = req.user.sub;
    return this.authService.forceLogoutAllDevices(userId);
  }

  // ==================== ENDPOINTS DE TOKENS Y UTILIDADES ====================

  /**
   * Verificar si un token está en blacklist
   * GET /auth/is-token-blacklisted
   */
  @Get('is-token-blacklisted')
  async isTokenBlacklisted(@Query('token') token: string) {
    return this.authService.isTokenBlacklisted(token);
  }

  /**
   * Limpiar tokens expirados
   * POST /auth/cleanup-expired-tokens
   */
  @Post('cleanup-expired-tokens')
  @HttpCode(HttpStatus.OK)
  async cleanupExpiredTokens() {
    return this.authService.cleanupExpiredTokens();
  }
}