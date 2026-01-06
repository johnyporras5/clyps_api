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
  Headers
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { RegisterWorkerDto } from './dto/register-worker.dto';
import { RegisterClientDto } from './dto/register-client.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TokenBlacklistService } from './services/token_blacklist.service'; 


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService,
  private readonly tokenBlacklistService: TokenBlacklistService,)
  
  {}

  // ========== ENDPOINTS DE REGISTRO  ==========

  /**
   * Registro para administradores
   * POST /auth/register/admin
   */
  @Post('register/admin')
  async registerAdmin(@Body() registerDto: RegisterAdminDto) {
    return this.authService.registerAdmin(registerDto);
  }

  /**
   * Registro para trabajadores
   * POST /auth/register/worker
   */
  @Post('register/worker')
  async registerWorker(@Body() registerDto: RegisterWorkerDto) {
    return this.authService.registerWorker(registerDto);
  }

  /**
   * Registro para clientes
   * POST /auth/register/client
   */
  @Post('register/client')
  async registerClient(@Body() registerDto: RegisterClientDto) {
    return this.authService.registerClient(registerDto);
  }

  // ========== ENDPOINT DE LOGIN  ==========

  /**
   * Login para todos los tipos de usuarios
   * POST /auth/login
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // ========== ENDPOINTS DE VERIFICACIÓN  ==========

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

  /**
   * Enviar código de verificación (para casos especiales)
   * POST /auth/send-verification-code
   */
  @Post('send-verification-code')
  @HttpCode(HttpStatus.OK)
  async sendVerificationCode(@Body() body: { email: string }) {
    return this.authService.sendVerificationCode(body.email);
  }

  // ========== ENDPOINTS DE VERIFICACIÓN DE DISPONIBILIDAD  ==========

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

  // ========== ENDPOINTS ADICIONALES  ==========

  /**
   * Verificar estado del usuario (si existe y si está verificado)
   * GET /auth/user-status
   */
  @Get('user-status')
  async checkUserStatus(@Query('email') email: string) {
    return this.authService.checkUserStatus(email);
  }

  /**
   * Verificar si un email existe y está verificado (versión mejorada)
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


  
   // ========== LOGOUT ==========

  /**
   * Cerrar sesión
   * POST /auth/logout
   * Requiere: JWT token
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Headers('authorization') authHeader: string, // ✅ Corregido: usar decorador @Headers
    @Req() req: any
  ) {
    const userId = req.user.sub;
    return this.authService.logout(authHeader, userId);
  }

  /**
   * Cerrar sesión en todos los dispositivos
   * POST /auth/logout-all
   * Requiere: JWT token
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async forceLogoutAllDevices(@Req() req: any) {
    const userId = req.user.sub;
    return this.authService.forceLogoutAllDevices(userId);
  }


}
