import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../user/entities/user.entity';
import { RegisterBaseDto } from './dto/register-base.dto';
import { LoginDto } from './dto/login.dto';
import { Worker } from '../worker/entities/worker.entity'; 
import { RegisterWorkerDto } from './dto/register-worker.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    private jwtService: JwtService,
  ) {}

  /**
   * Método interno de registro con tipo de usuario específico
   */
  private async registerUser(
    registerDto: RegisterBaseDto, 
    userType: 'adm' | 'wrk' | 'cli'
  ): Promise<{ 
    message: string; 
    user: Partial<User>;
    access_token?: string;
  }> {
    // Verificar si el email ya existe
    const existingUserByEmail = await this.userRepository.findOne({
      where: { email: registerDto.email }
    });

    if (existingUserByEmail) {
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
      userType: userType,
    });

    await this.userRepository.save(user);

    // Generar token JWT para login automático después del registro
    const payload = {
      email: user.email,
      sub: user.id,
      userType: user.userType
    };

    const access_token = this.jwtService.sign(payload);

    // Eliminar password del objeto de respuesta
    const { password, ...userWithoutPassword } = user;

    return {
      message: `${userType.charAt(0).toUpperCase() + userType.slice(1)} registrado exitosamente`,
      user: userWithoutPassword,
      access_token
    };
  }

  /**
   * Registro específico para administradores
   */
  async registerAdmin(registerDto: RegisterBaseDto): Promise<{ 
    message: string; 
    user: Partial<User>;
    access_token?: string;
  }> {
    return this.registerUser(registerDto, 'adm');
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
      // Si necesitas relacionar con el usuario, podrías agregar:
       userId: savedUser.id
    });

    await this.workerRepository.save(worker);

    // Generar token JWT para login automático después del registro
    const payload = {
      email: user.email,
      sub: user.id,
      userType: user.userType
    };

    const access_token = this.jwtService.sign(payload);

    // Eliminar password del objeto de respuesta
    const { password, ...userWithoutPassword } = user;

    return {
      message: 'Worker registrado exitosamente',
      user: userWithoutPassword,
      access_token
    };
  }

  /**
   * Registro específico para clientes
   */
  async registerClient(registerDto: RegisterBaseDto): Promise<{ 
    message: string; 
    user: Partial<User>;
    access_token?: string;
  }> {
    return this.registerUser(registerDto, 'cli');
  }

  /**
   * Login para todos los tipos de usuarios
   */
  async login(loginDto: LoginDto): Promise<{ 
    access_token: string; 
    user: Partial<User> 
  }> {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email }
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Actualizar lastLogin
    user.lastLogin = new Date();
    await this.userRepository.save(user);

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
      access_token,
      user: userWithoutPassword,
    };
  }

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
}