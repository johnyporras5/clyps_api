import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  Get, 
  Param 
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { RegisterWorkerDto } from './dto/register-worker.dto';
import { RegisterClientDto } from './dto/register-client.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  /**
   * Login para todos los tipos de usuarios
   * POST /auth/login
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

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
}