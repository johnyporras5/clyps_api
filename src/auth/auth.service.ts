import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../user/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { Worker } from '../worker/entities/worker.entity';
import { RegisterWorkerDto } from './dto/register-worker.dto';
import { Client } from '../client/entities/client.entity';
import { RegisterClientDto } from './dto/register-client.dto';
import {
  RegisterClientByAdminDto,
  isEmailUnavailable,
} from './dto/register-client-by-admin.dto';
import { EmailService } from '../email/email.service';
import { VerificationService } from '../verification/verification.service';
import { TokenBlacklistService } from './services/token_blacklist.service';
import { Company } from '../company/entities/company.entity';
import { CompanyService } from '../company/company.service';
import { CreateCompanyDto } from '../company/dto/create-company.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  RequestPasswordResetDto,
  ResetPasswordDto,
  VerifyResetCodeDto,
} from './dto/reset-password.dto';
import { ChangePasswordWithoutAuthDto } from './dto/change-password-without-auth.dto';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { FileUploadService } from '../common/services/file_upload.service';
import { CompanyCategoryService } from '../company_category/company_category.service';
import { SiteCategoryService } from '../site_category/site_category.service';
import { RealtimeService } from '../realtime/realtime.service';
import { companyRoom, companyPublicRoom } from '../realtime/rooms';
import type { AuthenticatedUser } from './types/authenticated-request';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    private companyService: CompanyService,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    private jwtService: JwtService,
    private emailService: EmailService,
    private verificationService: VerificationService,
    private tokenBlacklistService: TokenBlacklistService,
    private fileUploadService: FileUploadService,
    private readonly companyCategoryService: CompanyCategoryService,
    private readonly siteCategoryService: SiteCategoryService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Filtra una lista de ids de preferencias dejando sólo los que existen en el
   * catálogo global `site_category` (descarta ids inválidos). Devuelve [] si no
   * hay válidos, o undefined si no se enviaron preferencias.
   */
  private async sanitizePreferences(
    preferences?: number[],
  ): Promise<number[] | undefined> {
    if (preferences === undefined) return undefined;
    if (preferences.length === 0) return [];
    const catalog = await this.siteCategoryService.findAll();
    const validIds = new Set(catalog.map((c) => c.id));
    return preferences.filter((id) => validIds.has(id));
  }

  // ==================== CLAIMS PARA TIEMPO REAL (CLYP-247) ====================
  /**
   * Resuelve los claims de empresa que viajan en el JWT y que el Gateway de
   * WebSockets usa para meter el socket en sus rooms sin tocar la BD:
   *   - admin  (adm): companyId (su empresa). Sin companyWorkerId.
   *   - worker (wrk): companyId + companyWorkerId (su fila en company_worker).
   *   - client (cli): ninguno (pertenece a varias empresas; null/null).
   *
   * Este mismo método es la fuente de verdad para el fallback del Gateway
   * (estrategia (b) de CLYP-247): si llega un token "viejo" sin estos claims,
   * el handshake los puede resolver llamando aquí con el user del token.
   */
  async buildCompanyClaims(user: Pick<User, 'id' | 'userType'>): Promise<{
    companyId: number | null;
    companyWorkerId: number | null;
  }> {
    if (user.userType === 'adm') {
      const company = await this.companyRepository.findOne({
        where: { userId: user.id },
      });
      return { companyId: company?.id ?? null, companyWorkerId: null };
    }

    if (user.userType === 'wrk') {
      const companyWorker = await this.companyWorkerRepository.findOne({
        where: { userId: user.id, isActive: 1 },
      });
      return {
        companyId: companyWorker?.companyId ?? null,
        companyWorkerId: companyWorker?.id ?? null,
      };
    }

    // client: multi-empresa → sin companyId único.
    return { companyId: null, companyWorkerId: null };
  }

  // ==================== MÉTODOS DE REGISTRO ====================
  /**
   * Registro específico para administradores (con o sin logo)
   */
  async registerAdmin(
    registerDto: RegisterAdminDto,
    logoFile?: Express.Multer.File,
  ): Promise<{
    message: string;
    user: Partial<User>;
    access_token?: string;
  }> {
    // Verificar si el email ya existe
    const existingUserByEmail = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUserByEmail) {
      // Si el email pertenece a otro rol, rechazar inmediatamente
      if (existingUserByEmail.userType !== 'adm') {
        throw new ConflictException(
          'El email ya está registrado con un rol diferente (trabajador o cliente)',
        );
      }
      // Mismo rol (admin), pero no verificado → reenviar código
      if (existingUserByEmail.emailVerified === 0) {
        await this.sendVerificationCode(registerDto.email);
        throw new ConflictException({
          message:
            'El email ya está registrado pero no verificado. Se ha enviado un nuevo código de verificación.',
          requiresVerification: true,
          userId: existingUserByEmail.id,
        });
      }
      throw new ConflictException('El email ya está registrado');
    }

    // Verificar si el username ya existe
    const existingUserByUsername = await this.userRepository.findOne({
      where: { username: registerDto.username },
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

    const savedUser = await this.userRepository.save(user);
    // ==================== SUBIR LOGO DE LA COMPAÑÍA (SI SE PROPORCIONA) ====================
    let logoFileName: string | undefined = undefined;

    if (logoFile) {
      try {
        const logoInfo = await this.fileUploadService.saveFile(
          logoFile,
          'company_logo',
          'company',
          savedUser.id,
        );
        logoFileName = logoInfo.fileName;
        console.log(`✅ Logo guardado: ${logoFileName}`);
      } catch (error) {
        console.error('❌ Error al guardar el logo:', error);
        // Continuamos sin logo si hay error
      }
    }

    // ==================== CREAR COMPANY PARA EL ADMIN ====================
    const companyData: CreateCompanyDto = {
      name: registerDto.companyName,
      email: registerDto.email,
      userId: savedUser.id,
      logo: logoFileName,
      phone: registerDto.phone,
      location: registerDto.location,
    };

    await this.companyService.create(companyData);

    if (registerDto.categories && registerDto.categories.length > 0) {
      for (const categoryName of registerDto.categories) {
        await this.companyCategoryService.create(
          { name: categoryName },
          savedUser.id, // adminId
        );
      }
    }
    // Enviar código de verificación
    await this.sendVerificationCode(savedUser.email);

    // Eliminar password del objeto de respuesta
    const { password: _, ...userWithoutPassword } = savedUser;

    return {
      message:
        'Administrador registrado exitosamente. Por favor verifica tu email.',
      user: userWithoutPassword,
    };
  }

  /**
   * Genera una contraseña simple y fácil de escribir:
   * una palabra sencilla en minúscula seguida de números.
   * Ejemplo: "gato4821"
   */
  private generateRandomPassword(_length: number = 8): string {
    const words = [
      'gato',
      'sol',
      'luna',
      'casa',
      'flor',
      'mar',
      'rio',
      'pan',
      'cielo',
      'verde',
      'rojo',
      'pez',
      'uva',
      'oso',
      'lago',
    ];

    const word = words[Math.floor(Math.random() * words.length)];

    // 4 dígitos (sin ceros a la izquierda) -> entre 1000 y 9999
    const digits = Math.floor(1000 + Math.random() * 9000).toString();

    return `${word}${digits}`;
  }

  /**
   * Registro específico para trabajadores CON CONTRASEÑA AUTOMÁTICA
   */
  async registerWorker(
    registerDto: RegisterWorkerDto,
    adminId: number, // ID del administrador que registra
    pictureFile?: Express.Multer.File,
  ): Promise<{
    message: string;
    user: Partial<User>;
    generatedPassword?: string;
    access_token?: string;
  }> {
    // 1. Verificar si el email ya existe en la tabla User
    const existingUserByEmail = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    let user: User;
    let worker: Worker | null = null;
    let generatedPassword: string | undefined;

    // Verificar que el admin existe y es administrador
    const admin = await this.userRepository.findOne({
      where: { id: adminId, userType: 'adm' },
    });

    if (!admin) {
      throw new UnauthorizedException(
        'Solo los administradores pueden registrar trabajadores',
      );
    }

    // Buscar la compañía del administrador
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });

    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    // ==================== VERIFICAR SI YA EXISTE EL TRABAJADOR ====================
    // Un trabajador pertenece a una sola compañía: cualquier re-registro con un
    // email ya existente es un CONFLICTO. Devolvemos 409 con un `code` para que
    // el frontend lo trate como error informativo (no como creación exitosa).
    if (existingUserByEmail) {
      // El email pertenece a un usuario que NO es trabajador
      if (existingUserByEmail.userType !== 'wrk') {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'EMAIL_REGISTERED_DIFFERENT_ROLE',
          message:
            'El email ya está registrado con un rol diferente (no trabajador).',
        });
      }

      // El email pertenece a un trabajador que aún no verificó su correo:
      // reenviamos el código para que pueda completar la verificación.
      if (existingUserByEmail.emailVerified === 0) {
        await this.sendVerificationCode(registerDto.email);
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'WORKER_EXISTS_UNVERIFIED',
          message:
            'El trabajador ya estaba registrado pero su correo no estaba verificado. Se ha enviado un nuevo código de verificación a su correo para completar el proceso.',
        });
      }

      // El email pertenece a un trabajador ya registrado y verificado.
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'WORKER_ALREADY_EXISTS',
        message:
          'El trabajador ya estaba registrado y verificado en el sistema.',
      });
    } else {
      // ==================== CREAR NUEVO TRABAJADOR ====================
      // Verificar si el username ya existe
      const existingUserByUsername = await this.userRepository.findOne({
        where: { username: registerDto.username },
      });

      if (existingUserByUsername) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'USERNAME_TAKEN',
          message: 'El nombre de usuario ya está en uso.',
        });
      }

      // Generar contraseña automáticamente
      generatedPassword = this.generateRandomPassword(8);

      // Encriptar contraseña generada
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      // Crear usuario con la contraseña generada
      const newUser = this.userRepository.create({
        username: registerDto.username,
        email: registerDto.email,
        password: hashedPassword,
        userType: 'wrk',
        emailVerified: 0,
      });

      user = await this.userRepository.save(newUser);

      // Enviar credenciales por correo solo si es nuevo
      const credentialsSent = await this.emailService.sendWorkerCredentials(
        user.email,
        user.username,
        generatedPassword,
        company.name, // Nombre de la compañía para el email
      );

      if (!credentialsSent) {
        console.warn(
          'No se pudieron enviar las credenciales por correo, pero el usuario fue creado',
        );
      }

      // Enviar código de verificación solo si es nuevo
      await this.sendVerificationCode(user.email);
    }

    // ==================== [NUEVO] PROCESAR ARCHIVO DE FOTO (SI SE ENVIÓ) ====================
    let pictureFileName: string | undefined;
    if (pictureFile) {
      try {
        const fileInfo = await this.fileUploadService.saveFile(
          pictureFile,
          'worker_photo', // subcarpeta
          'worker', // tipo de entidad
          user.id, // ID del usuario
        );
        pictureFileName = fileInfo.fileName;
        console.log(`✅ Foto de trabajador guardada: ${pictureFileName}`);
      } catch (error) {
        console.error('❌ Error al guardar foto de trabajador:', error);
      }
    }

    // ==================== VERIFICAR SI YA ESTÁ EN COMPANY_WORKER ====================
    // Verificar si ya está asignado a esta compañía por userId
    const existingAssignment = await this.companyWorkerRepository.findOne({
      where: {
        userId: user.id,
        companyId: company.id,
      },
    });

    // Buscar el perfil de worker
    worker = await this.workerRepository.findOne({
      where: { userId: user.id },
    });

    // Si no existe perfil de worker, crearlo
    if (!worker) {
      console.log(`Creando perfil de trabajador (userId: ${user.id})`);

      const newWorker = this.workerRepository.create({
        name: registerDto.name,
        phone: registerDto.phone,
        address: registerDto.address,
        birthdate: registerDto.birthdate,
        picture: pictureFileName,
        description: registerDto.description,
        isActive: 1,
        location: registerDto.location,
        userId: user.id,
      });

      worker = await this.workerRepository.save(newWorker);

      console.log(`Perfil de trabajador creado con ID: ${worker.id}`);
    }

    // Si no existe asignación en company_worker, crearla
    if (!existingAssignment) {
      // Asegurarse de que worker existe
      if (!worker) {
        throw new NotFoundException('No se encontró el perfil del trabajador');
      }

      // Crear registro en company_worker con el campo calendar
      const companyWorker = this.companyWorkerRepository.create({
        workerId: worker.id,
        companyId: company.id,
        userId: user.id,
        isActive: 1,
        startDate: new Date(),
        servicesDetail: {},
        calendar: registerDto.calendar || {},
      });

      await this.companyWorkerRepository.save(companyWorker);
    }

    // No se genera token JWT en el registro de trabajador

    // Eliminar password del objeto de respuesta
    const { password: _, ...userWithoutPassword } = user;

    // ==================== CONSTRUIR MENSAJE DE RESPUESTA ====================
    // En este punto el trabajador es siempre nuevo: los casos de trabajador
    // existente ya retornaron 409 más arriba.
    const message = [
      `Trabajador registrado exitosamente en el sistema CLYPS.`,
      `Ha sido asignado a la compañía '${company.name}'.`,
      `Las credenciales de acceso han sido enviadas a su correo electrónico.`,
      `Para activar su cuenta, por favor verifique su correo utilizando el código enviado.`,
    ].join(' ');

    // Construir objeto de respuesta
    const response: any = {
      message,
      user: userWithoutPassword,
    };

    // worker.added (CLYP-246): notifica el alta del worker al roster de la
    // empresa (afecta la vista de equipo del admin y la selección de providers
    // del cliente). Best-effort: no rompe el registro.
    try {
      const companyWorker = await this.companyWorkerRepository.findOne({
        where: { workerId: worker.id, companyId: company.id },
      });
      this.realtime.emitEntity(
        [companyRoom(company.id), companyPublicRoom(company.id)],
        {
          type: 'worker.added',
          entityId: worker.id,
          companyId: company.id,
          data: { worker, companyWorkerId: companyWorker?.id ?? null },
        },
      );
    } catch {
      // best-effort
    }

    return response;
  }

  /**
   * Registro específico para clientes CON CONTRASEÑA AUTOMÁTICA
   */
  async registerClient(
    registerDto: RegisterClientDto,
    pictureFile?: Express.Multer.File,
  ): Promise<{
    message: string;
    user: Partial<User>;
    generatedPassword?: string;
    access_token?: string;
  }> {
    // 1. Verificar si el correo ya existe en la tabla User
    const existingUserByEmail = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    let user: User;
    let client: Client | null = null;
    const isExistingUser = false;

    // ==================== EL EMAIL YA EXISTE → CONFLICTO (409) ====================
    // El registro público NO debe actualizar ni sobrescribir un perfil existente:
    // cualquier email ya registrado se trata como conflicto, con un `code` para
    // que el frontend lo muestre como error informativo (no como creación exitosa).
    if (existingUserByEmail) {
      if (existingUserByEmail.userType !== 'cli') {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'EMAIL_REGISTERED_DIFFERENT_ROLE',
          message:
            'El email ya está registrado con un rol diferente (no cliente).',
        });
      }

      if (existingUserByEmail.emailVerified === 0) {
        // Reenviar código para que pueda completar la verificación pendiente.
        await this.sendVerificationCode(registerDto.email);
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'CLIENT_EXISTS_UNVERIFIED',
          message:
            'El cliente ya estaba registrado pero su correo no estaba verificado. Se ha enviado un nuevo código de verificación a su correo para completar el proceso.',
        });
      }

      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: 'CLIENT_ALREADY_EXISTS',
        message: 'El cliente ya estaba registrado y verificado en el sistema.',
      });
    } else {
      // ==================== CREAR NUEVO USUARIO ====================
      const existingUserByUsername = await this.userRepository.findOne({
        where: { username: registerDto.username },
      });

      if (existingUserByUsername) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'USERNAME_TAKEN',
          message: 'El nombre de usuario ya está en uso.',
        });
      }

      // Si el cliente envió contraseña, úsala; si no, generar aleatoria y enviar por correo.
      const clientProvidedPassword = !!registerDto.password;
      const passwordToUse =
        registerDto.password || this.generateRandomPassword(8);
      const hashedPassword = await bcrypt.hash(passwordToUse, 10);

      const newUser = this.userRepository.create({
        username: registerDto.username,
        email: registerDto.email,
        password: hashedPassword,
        userType: 'cli',
        emailVerified: 0,
      });

      user = await this.userRepository.save(newUser);

      if (!clientProvidedPassword) {
        const credentialsSent = await this.emailService.sendClientCredentials(
          user.email,
          user.username,
          passwordToUse,
        );

        if (!credentialsSent) {
          console.warn(
            'No se pudieron enviar las credenciales por correo, pero el usuario fue creado',
          );
        }
      }

      await this.sendVerificationCode(user.email);
    }

    // ==================== [NUEVO] PROCESAR ARCHIVO DE FOTO (SI SE ENVIÓ) ====================
    let pictureFileName: string | undefined;
    if (pictureFile) {
      try {
        const fileInfo = await this.fileUploadService.saveFile(
          pictureFile,
          'client_photo', // subcarpeta
          'client', // tipo de entidad
          user.id, // ID del usuario
        );
        pictureFileName = fileInfo.fileName;
        console.log(`✅ Foto de cliente guardada: ${pictureFileName}`);
      } catch (error) {
        console.error('❌ Error al guardar foto de cliente:', error);
        // Si falla, se ignora y se usará el valor del DTO (si existe)
      }
    }

    // ==================== VERIFICAR SI YA TIENE PERFIL DE CLIENTE ====================
    client = await this.clientRepository.findOne({
      where: { userId: user.id },
    });

    let createdClientProfile = false;
    let updatedClientProfile = false;
    const addedNewCompanies = false;

    if (!client) {
      // Crear nuevo perfil de cliente
      console.log(`Creando perfil de cliente (userId: ${user.id})`);

      const preferences = await this.sanitizePreferences(
        registerDto.preferences,
      );

      const newClient = this.clientRepository.create({
        name: registerDto.name,
        lastName: registerDto.lastName,
        email: registerDto.email,
        phone: registerDto.phone,
        birthDate: registerDto.birthdate,
        picture: pictureFileName,
        isActive: registerDto.isActive !== undefined ? registerDto.isActive : 1,
        companies: [],
        preferences: preferences ?? [],
        location: registerDto.location,
        userId: user.id,
      });

      client = await this.clientRepository.save(newClient);
      createdClientProfile = true;
      console.log(`Perfil de cliente creado con ID: ${client.id}`);
    } else {
      // ==================== VERIFICAR SI HAY CAMBIOS REALES ====================
      console.log(
        `Verificando cambios para cliente existente (userId: ${user.id})`,
      );

      // Preparar objeto con solo los campos que vienen en el DTO (no undefined)
      const updateData: any = {};
      let hasChanges = false;

      // Comparar cada campo individualmente, solo si viene en el DTO
      if (registerDto.name !== undefined && registerDto.name !== client.name) {
        updateData.name = registerDto.name;
        hasChanges = true;
        console.log('Cambio detectado en nombre');
      }

      if (
        registerDto.lastName !== undefined &&
        registerDto.lastName !== client.lastName
      ) {
        updateData.lastName = registerDto.lastName;
        hasChanges = true;
        console.log('Cambio detectado en apellido');
      }

      if (
        registerDto.email !== undefined &&
        registerDto.email !== client.email
      ) {
        updateData.email = registerDto.email;
        hasChanges = true;
        console.log('Cambio detectado en email');
      }

      if (
        registerDto.phone !== undefined &&
        registerDto.phone !== client.phone
      ) {
        updateData.phone = registerDto.phone;
        hasChanges = true;
        console.log('Cambio detectado en teléfono');
      }

      if (registerDto.birthdate !== undefined) {
        const currentBirthDate = client.birthDate
          ? new Date(client.birthDate).toISOString().split('T')[0]
          : null;
        const newBirthDate = registerDto.birthdate
          ? new Date(registerDto.birthdate).toISOString().split('T')[0]
          : null;

        if (currentBirthDate !== newBirthDate) {
          updateData.birthDate = registerDto.birthdate;
          hasChanges = true;
          console.log('Cambio detectado en fecha de nacimiento');
        }
      }

      if (pictureFileName) {
        updateData.picture = pictureFileName;
        hasChanges = true;
        console.log('Cambio detectado en foto (archivo)');
      }

      if (
        registerDto.isActive !== undefined &&
        registerDto.isActive !== client.isActive
      ) {
        updateData.isActive = registerDto.isActive;
        hasChanges = true;
        console.log('Cambio detectado en estado activo');
      }

      if (
        registerDto.location !== undefined &&
        registerDto.location !== client.location
      ) {
        updateData.location = registerDto.location;
        hasChanges = true;
        console.log('Cambio detectado en ubicación');
      }

      // Solo actualizar si hay cambios reales
      if (hasChanges) {
        console.log(
          `Detectados cambios reales. Actualizando perfil del cliente...`,
        );

        // Aplicar actualizaciones
        await this.clientRepository.update(client.id, updateData);
        updatedClientProfile = true;

        // Recargar el cliente actualizado
        client = await this.clientRepository.findOne({
          where: { id: client.id },
        });

        console.log(`Perfil de cliente actualizado exitosamente.`);
      } else {
        console.log(
          `No se detectaron cambios reales en el perfil del cliente. No se realizaron actualizaciones.`,
        );
      }
    }

    // Eliminar password del objeto de respuesta
    const { password: _, ...userWithoutPassword } = user;

    // ==================== CONSTRUIR MENSAJE DE RESPUESTA ====================
    const actionParts: string[] = [];

    if (isExistingUser) {
      const isVerified = user.emailVerified === 1;

      if (!createdClientProfile && !updatedClientProfile) {
        // No hubo cambios en el perfil
        if (isVerified) {
          actionParts.push(
            `El cliente ya estaba registrado y verificado en el sistema.`,
          );
        } else {
          actionParts.push(
            `El cliente ya estaba registrado en el sistema pero su correo no estaba verificado.`,
          );
          actionParts.push(
            `Se ha enviado un nuevo código de verificación para completar este proceso.`,
          );
        }

        // CORRECCIÓN: Verificar que client no sea null y que companies exista
        if (
          client &&
          Array.isArray(client.companies) &&
          client.companies.length > 0
        ) {
          actionParts.push(
            `El cliente mantiene sus ${client.companies.length} compañía(s) actuales sin cambios.`,
          );
        }
      } else {
        // Hubo cambios en el perfil
        if (createdClientProfile) {
          actionParts.push(
            `Se completó el perfil del cliente con la información proporcionada.`,
          );
        } else if (updatedClientProfile) {
          actionParts.push(
            `Se actualizó el perfil del cliente con la nueva información.`,
          );
        }

        if (addedNewCompanies) {
          actionParts.push(
            `Se agregaron nuevas compañías al perfil del cliente.`,
          );
        }
      }
    } else {
      // Nuevo cliente
      actionParts.push(`Cliente registrado exitosamente en el sistema CLYPS.`);
      actionParts.push(
        `Las credenciales de acceso han sido enviadas a su correo electrónico.`,
      );
      actionParts.push(
        `Para activar su cuenta, por favor verifique su correo utilizando el código enviado.`,
      );
    }
    const message = actionParts.join(' ');

    // CORRECCIÓN: Usar optional chaining para evitar errores cuando client es null
    const totalCompanies = client?.companies?.length || 0;

    // Construir objeto de respuesta
    const response: any = {
      message,
      user: userWithoutPassword,
      profileStatus: {
        isNewUser: !isExistingUser,
        profileCreated: createdClientProfile,
        profileUpdated: updatedClientProfile,
        hasNewCompanies: addedNewCompanies,
        totalCompanies: totalCompanies,
        noChangesDetected:
          isExistingUser && !createdClientProfile && !updatedClientProfile,
      },
    };

    return response;
  }
  /**
   * Registro de cliente por parte del administrador/worker de la compañía
   */
  private async resolveWorkerCompanyContext(
    caller: AuthenticatedUser,
  ): Promise<{ companyId: number; companyWorkerId: number }> {
    if (caller.companyWorkerId != null) {
      const tokenCw = await this.companyWorkerRepository.findOne({
        where: { id: caller.companyWorkerId, userId: caller.sub, isActive: 1 },
      });
      if (tokenCw) {
        return { companyId: tokenCw.companyId, companyWorkerId: tokenCw.id };
      }
    }
    const cw = await this.companyWorkerRepository.findOne({
      where: { userId: caller.sub, isActive: 1 },
    });
    if (!cw) {
      throw new NotFoundException(
        'El trabajador no está asociado a ninguna compañía activa',
      );
    }
    return { companyId: cw.companyId, companyWorkerId: cw.id };
  }

  async registerClientByAdmin(
    registerDto: RegisterClientByAdminDto,
    caller: AuthenticatedUser,
    pictureFile?: Express.Multer.File,
  ): Promise<{
    message: string;
    user: Partial<User>;
  }> {
    let company: Company;
    let createdByCompanyWorkerId: number | null = null;

    if (caller.userType === 'adm') {
      const admin = await this.userRepository.findOne({
        where: { id: caller.sub, userType: 'adm' },
      });
      if (!admin) {
        throw new UnauthorizedException(
          'Solo los administradores pueden registrar clientes',
        );
      }
      const adminCompany = await this.companyRepository.findOne({
        where: { userId: caller.sub },
      });
      if (!adminCompany) {
        throw new NotFoundException(
          'El administrador no tiene una compañía asignada',
        );
      }
      company = adminCompany;
    } else if (caller.userType === 'wrk') {
      const ctx = await this.resolveWorkerCompanyContext(caller);
      const workerCompany = await this.companyRepository.findOne({
        where: { id: ctx.companyId },
      });
      if (!workerCompany) {
        throw new NotFoundException(
          'El trabajador no tiene una compañía asignada',
        );
      }
      company = workerCompany;
      createdByCompanyWorkerId = ctx.companyWorkerId;
    } else {
      throw new UnauthorizedException(
        'Solo administradores o trabajadores pueden registrar clientes',
      );
    }

    // 2. Verificar email. Si el cliente no tiene email ("no disponible"/vacío),
    // se omite la búsqueda por email y la identidad se garantiza por username.
    const emailAbsent = isEmailUnavailable(registerDto.email);
    const existingUserByEmail = emailAbsent
      ? null
      : await this.userRepository.findOne({
          where: { email: registerDto.email },
        });

    let user: User;
    let client: Client | null = null;
    let isExistingUser = false;
    let generatedPassword: string | undefined;

    if (existingUserByEmail) {
      if (existingUserByEmail.userType !== 'cli') {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'EMAIL_REGISTERED_DIFFERENT_ROLE',
          message:
            'El email ya está registrado con un rol diferente (no cliente).',
        });
      }
      user = existingUserByEmail;
      isExistingUser = true;
    } else {
      const existingByUsername = await this.userRepository.findOne({
        where: { username: registerDto.username },
      });
      if (existingByUsername) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'USERNAME_TAKEN',
          message: 'El nombre de usuario ya está en uso.',
        });
      }

      generatedPassword = this.generateRandomPassword(8);
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      const newUser = this.userRepository.create({
        username: registerDto.username,
        email: registerDto.email,
        password: hashedPassword,
        userType: 'cli',
        emailVerified: 0,
      });
      user = await this.userRepository.save(newUser);

      // Solo se envían credenciales/código si el cliente tiene email real.
      if (!emailAbsent) {
        await this.emailService.sendClientCredentials(
          user.email,
          user.username,
          generatedPassword,
        );
        await this.sendVerificationCode(user.email);
      }
    }

    // 3. Buscar el perfil del cliente
    client = await this.clientRepository.findOne({
      where: { userId: user.id },
    });

    if (client) {
      // El cliente ya tiene perfil: solo gestionamos su relación con la compañía.
      // Como un cliente puede pertenecer a varias compañías, vincularlo a una
      // compañía NUEVA es válido; pero si YA estaba vinculado a esta, es conflicto
      // y devolvemos 409 para que el frontend no lo trate como creación exitosa.
      const currentCompanies: number[] = Array.isArray(client.companies)
        ? client.companies
        : [];

      if (currentCompanies.includes(company.id)) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'CLIENT_ALREADY_IN_COMPANY',
          message: `El cliente ya estaba registrado y vinculado a la compañía '${company.name}'.`,
        });
      }

      currentCompanies.push(company.id);

      const shouldSetCreator =
        createdByCompanyWorkerId != null &&
        client.createdByCompanyWorkerId == null;
      await this.clientRepository.update(client.id, {
        companies: currentCompanies,
        ...(shouldSetCreator ? { createdByCompanyWorkerId } : {}),
      });
    } else {
      // No existe perfil de cliente: procesamos la foto (si la hay) y lo creamos.
      let pictureFileName: string | undefined;
      if (pictureFile) {
        try {
          const fileInfo = await this.fileUploadService.saveFile(
            pictureFile,
            'client_photo',
            'client',
            user.id,
          );
          pictureFileName = fileInfo.fileName;
        } catch (error) {
          console.error('Error al guardar foto de cliente:', error);
        }
      }

      const newClient = this.clientRepository.create({
        name: registerDto.name,
        lastName: registerDto.lastName,
        email: registerDto.email,
        phone: registerDto.phone,
        birthDate: registerDto.birthdate,
        picture: pictureFileName,
        isActive: registerDto.isActive ?? 1,
        companies: [company.id],
        location: registerDto.location,
        userId: user.id,
        createdByCompanyWorkerId,
      });
      client = await this.clientRepository.save(newClient);
    }

    const { password: _, ...userWithoutPassword } = user;

    const message = isExistingUser
      ? `Cliente existente vinculado a la compañía '${company.name}' exitosamente.`
      : emailAbsent
        ? `Cliente registrado exitosamente y vinculado a la compañía '${company.name}'.`
        : `Cliente registrado exitosamente y vinculado a la compañía '${company.name}'. Las credenciales fueron enviadas a su correo.`;

    // client.added (CLYP-246): notifica el alta/vinculación del cliente al canal
    // de la empresa. Best-effort.
    try {
      this.realtime.emitEntity(companyRoom(company.id), {
        type: 'client.added',
        entityId: client.id,
        companyId: company.id,
        data: client,
      });
    } catch {
      // best-effort
    }

    // No se retorna `generatedPassword`: la contraseña en texto plano no debe
    // salir en la respuesta. Cuando hay email, se envía por correo.
    return { message, user: userWithoutPassword };
  }

  // ==================== MÉTODOS DE LOGIN ====================

  async login(
    loginDto: LoginDto,
  ): Promise<{ access_token: string; user: Partial<User> }> {
    const { email, password } = loginDto; // 'email' es el identificador (email o username)

    // Buscar por email O username
    const user = await this.userRepository.findOne({
      where: [{ email: email }, { username: email }],
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Si el usuario no está verificado
    if (user.emailVerified === 0) {
      const codeStatus =
        await this.verificationService.getVerificationCodeStatus(user.id);

      if (codeStatus.hasActiveCode && codeStatus.secondsRemaining) {
        const minutesRemaining = Math.ceil(codeStatus.secondsRemaining / 60);
        throw new UnauthorizedException({
          message: `Por favor verifica tu email antes de iniciar sesión. Ya tienes un código activo (expira en ${minutesRemaining} minutos). Revisa tu correo.`,
          requiresVerification: true,
          userId: user.id,
          hasActiveCode: true,
          secondsRemaining: codeStatus.secondsRemaining,
          minutesRemaining,
        });
      } else {
        try {
          // IMPORTANTE: Enviar código al EMAIL real del usuario
          await this.sendVerificationCode(user.email); // Cambiado: usamos user.email
          throw new UnauthorizedException({
            message:
              'Por favor verifica tu email antes de iniciar sesión. Se ha enviado un nuevo código de verificación a tu correo.',
            requiresVerification: true,
            userId: user.id,
          });
        } catch (error) {
          if (
            error instanceof BadRequestException ||
            error instanceof NotFoundException
          ) {
            throw new UnauthorizedException({
              message: 'Por favor verifica tu email antes de iniciar sesión.',
              requiresVerification: true,
              userId: user.id,
            });
          }
          if (error instanceof UnauthorizedException) {
            throw error;
          }
          throw new UnauthorizedException({
            message: 'Por favor verifica tu email antes de iniciar sesión.',
            requiresVerification: true,
            userId: user.id,
          });
        }
      }
    }

    // Actualizar lastLogin
    user.lastLogin = new Date();
    await this.userRepository.save(user);

    const companyClaims = await this.buildCompanyClaims(user);
    const payload = {
      email: user.email,
      sub: user.id,
      userType: user.userType,
      companyId: companyClaims.companyId,
      companyWorkerId: companyClaims.companyWorkerId,
    };

    const access_token = this.jwtService.sign(payload);
    const { password: _, ...userWithoutPassword } = user;

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
  async sendVerificationCode(
    email: string,
  ): Promise<{ message: string; userId: number }> {
    // El identificador puede ser email o username (igual que en el login).
    const user = await this.userRepository.findOne({
      where: [{ email }, { username: email }],
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Si ya está verificado, no enviar código
    if (user.emailVerified === 1) {
      throw new BadRequestException('El email ya está verificado');
    }

    // Primero, verificar si ya existe un código activo
    const codeStatus = await this.verificationService.getVerificationCodeStatus(
      user.id,
    );

    if (codeStatus.hasActiveCode && codeStatus.secondsRemaining) {
      const minutesRemaining = Math.ceil(codeStatus.secondsRemaining / 60);

      return {
        message: `Ya tienes un código de verificación activo (expira en ${minutesRemaining} minutos). Revisa tu bandeja de entrada.`,
        userId: user.id,
      };
    }

    // Si no hay código activo, generar uno nuevo
    const code = await this.verificationService.generateVerificationCode(
      user.id,
    );
    const emailSent = await this.emailService.sendVerificationCode(
      user.email,
      code,
      user.username,
    );

    if (!emailSent) {
      console.warn('No se pudo enviar el email de verificación');
      throw new BadRequestException(
        'No se pudo enviar el código de verificación',
      );
    }

    return {
      message:
        'Código de verificación enviado a tu email. Por favor, revisa tu bandeja de entrada.',
      userId: user.id,
    };
  }

  async verifyEmail(email: string, code: string): Promise<{ message: string }> {
    const success = await this.verificationService.verifyCode(email, code);

    if (success) {
      return {
        message: 'Email verificado correctamente. Ahora puedes iniciar sesión.',
      };
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
  async checkUserStatus(
    email: string,
  ): Promise<{ exists: boolean; verified: boolean; userId?: number }> {
    const user = await this.userRepository.findOne({
      where: [{ email }, { username: email }],
    });

    if (!user) {
      return { exists: false, verified: false };
    }

    return {
      exists: true,
      verified: user.emailVerified === 1,
      userId: user.id,
    };
  }

  // ==================== MÉTODOS DE CAMBIO Y RESETEO DE CONTRASEÑA ====================

  /**
   * Cambiar contraseña (usuario autenticado)
   */
  async changePassword(
    userId: number,
    changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar contraseña actual
    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    // Verificar que las nuevas contraseñas coincidan
    if (
      changePasswordDto.newPassword !== changePasswordDto.confirmNewPassword
    ) {
      throw new BadRequestException('Las nuevas contraseñas no coinciden');
    }

    // Verificar que la nueva contraseña no sea igual a la actual
    const isSamePassword = await bcrypt.compare(
      changePasswordDto.newPassword,
      user.password,
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la actual',
      );
    }

    // Encriptar nueva contraseña
    const hashedNewPassword = await bcrypt.hash(
      changePasswordDto.newPassword,
      10,
    );

    // Actualizar contraseña
    user.password = hashedNewPassword;
    await this.userRepository.save(user);

    // Enviar email de notificación
    try {
      await this.emailService.sendPasswordChangedNotification(
        user.email,
        user.username,
      );
    } catch (error) {
      console.warn('No se pudo enviar email de notificación:', error.message);
    }

    return { message: 'Contraseña cambiada exitosamente' };
  }

  async requestPasswordReset(
    requestPasswordResetDto: RequestPasswordResetDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: requestPasswordResetDto.email },
    });

    // Verificar explícitamente si el usuario existe
    if (!user) {
      throw new NotFoundException(
        'No existe un usuario registrado con este email',
      );
    }

    // Verificar si el email está verificado (opcional, dependiendo de tus requisitos)
    if (user.emailVerified === 0) {
      throw new BadRequestException(
        'Por favor verifica tu email antes de solicitar un reseteo de contraseña',
      );
    }

    // Generar código de reseteo
    const code = await this.verificationService.generatePasswordResetCode(
      user.id,
    );

    // Enviar email con el código
    const emailSent = await this.emailService.sendPasswordResetCode(
      user.email,
      code,
      user.username,
    );

    if (!emailSent) {
      console.warn('No se pudo enviar email de reseteo de contraseña');
      throw new BadRequestException(
        'No se pudo enviar el código de reseteo de contraseña',
      );
    }

    return {
      message:
        'Se ha enviado un código de restablecimiento de contraseña a tu email',
    };
  }

  /**
   * Verificar código de reseteo de contraseña
   */
  async verifyResetCode(
    verifyResetCodeDto: VerifyResetCodeDto,
  ): Promise<{ message: string; valid: boolean }> {
    const user = await this.userRepository.findOne({
      where: { email: verifyResetCodeDto.email },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const isValid = await this.verificationService.verifyCodeByUserId(
      user.id,
      verifyResetCodeDto.code,
      'password_reset',
    );

    if (isValid) {
      return {
        message: 'Código válido. Puedes proceder a cambiar tu contraseña.',
        valid: true,
      };
    }

    return {
      message: 'Código inválido o expirado',
      valid: false,
    };
  }

  /**
   * Resetear contraseña usando código
   */
  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: resetPasswordDto.email },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar que el código sea válido
    const isValid = await this.verificationService.verifyCodeByUserId(
      user.id,
      resetPasswordDto.code,
      'password_reset',
    );

    if (!isValid) {
      throw new BadRequestException('Código inválido o expirado');
    }

    // Encriptar nueva contraseña
    const hashedNewPassword = await bcrypt.hash(
      resetPasswordDto.newPassword,
      10,
    );

    // Actualizar contraseña
    user.password = hashedNewPassword;
    await this.userRepository.save(user);

    // Enviar email de confirmación
    try {
      await this.emailService.sendPasswordChangedNotification(
        user.email,
        user.username,
      );
    } catch (error) {
      console.warn('No se pudo enviar email de notificación:', error.message);
    }

    return { message: 'Contraseña restablecida exitosamente' };
  }

  /**
   * Logout - Invalidar token actual
   */
  async logout(
    authHeader: string,
    userId: number,
  ): Promise<{ message: string }> {
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
    const invalidated = await this.tokenBlacklistService.forceLogoutUser(
      userId,
      'force_logout',
    );

    // Actualizar lastLogout
    await this.userRepository.update(userId, {
      lastLogout: new Date(),
    });

    return {
      message: `Sesiones cerradas exitosamente. ${invalidated} tokens invalidados.`,
    };
  }

  /**
   * Cambiar contraseña sin autenticación (usando código de verificación)
   * Para usuarios que olvidaron su contraseña
   */
  async changePasswordWithoutAuth(
    changePasswordDto: ChangePasswordWithoutAuthDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { email: changePasswordDto.email },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar que las nuevas contraseñas coincidan
    if (
      changePasswordDto.newPassword !== changePasswordDto.confirmNewPassword
    ) {
      throw new BadRequestException('Las nuevas contraseñas no coinciden');
    }

    // Verificar que la nueva contraseña no sea igual a la anterior
    const isSamePassword = await bcrypt.compare(
      changePasswordDto.newPassword,
      user.password,
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente a la anterior',
      );
    }

    // Encriptar nueva contraseña
    const hashedNewPassword = await bcrypt.hash(
      changePasswordDto.newPassword,
      10,
    );

    // Actualizar contraseña
    user.password = hashedNewPassword;
    await this.userRepository.save(user);

    // Enviar email de notificación
    try {
      await this.emailService.sendPasswordChangedNotification(
        user.email,
        user.username,
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
}
