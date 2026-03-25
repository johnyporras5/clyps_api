import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
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
import { EmailService } from '../email/email.service';
import { VerificationService } from '../verification/verification.service';
import { TokenBlacklistService } from './services/token_blacklist.service';
import { Company } from '../company/entities/company.entity';
import { CompanyService } from '../company/company.service';
import { CreateCompanyDto } from '../company/dto/create-company.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestPasswordResetDto, ResetPasswordDto, VerifyResetCodeDto } from './dto/reset-password.dto';
import { ChangePasswordWithoutAuthDto } from './dto/change-password-without-auth.dto';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { RegisterAdminDto } from './dto/register-admin.dto';
import { FileUploadService } from '../common/services/file_upload.service';
import { CompanyCategoryService } from '../company_category/company_category.service';


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

  ) { }

  // ==================== MÉTODOS DE REGISTRO ====================
  /**
    * Registro específico para administradores (con o sin logo)
    */
  async registerAdmin(
    registerDto: RegisterAdminDto,
    logoFile?: Express.Multer.File
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
      // Si el email pertenece a otro rol, rechazar inmediatamente
      if (existingUserByEmail.userType !== 'adm') {
        throw new ConflictException('El email ya está registrado con un rol diferente (trabajador o cliente)');
      }
      // Mismo rol (admin), pero no verificado → reenviar código
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

    const savedUser = await this.userRepository.save(user);
    // ==================== SUBIR LOGO DE LA COMPAÑÍA (SI SE PROPORCIONA) ====================
    let logoFileName: string | undefined = undefined;

    if (logoFile) {
      try {
        const logoInfo = await this.fileUploadService.saveFile(
          logoFile,
          'company_logo',
          'company',
          savedUser.id
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
    };

    await this.companyService.create(companyData);


    if (registerDto.categories && registerDto.categories.length > 0) {
      for (const categoryName of registerDto.categories) {
        await this.companyCategoryService.create(
          { name: categoryName },
          savedUser.id  // adminId
        );
      }
    }
    // Enviar código de verificación
    await this.sendVerificationCode(savedUser.email);

    // Generar token JWT
    const payload = {
      email: savedUser.email,
      sub: savedUser.id,
      userType: savedUser.userType
    };

    const access_token = this.jwtService.sign(payload);

    // Eliminar password del objeto de respuesta
    const { password, ...userWithoutPassword } = savedUser;

    return {
      message: 'Administrador registrado exitosamente. Por favor verifica tu email.',
      user: userWithoutPassword,
    };
  }

  /**
   * Genera una contraseña segura automáticamente
   */
  private generateRandomPassword(length: number = 12): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    const allChars = uppercase + lowercase + numbers + symbols;
    let password = '';

    // Asegurar al menos un carácter de cada tipo
    password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    password += symbols.charAt(Math.floor(Math.random() * symbols.length));

    // Completar el resto de la longitud
    for (let i = 4; i < length; i++) {
      password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }

    // Mezclar la contraseña
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Registro específico para trabajadores CON CONTRASEÑA AUTOMÁTICA
   */
  async registerWorker(
    registerDto: RegisterWorkerDto,
    adminId: number, // ID del administrador que registra
    pictureFile?: Express.Multer.File
  ): Promise<{
    message: string;
    user: Partial<User>;
    generatedPassword?: string;
    access_token?: string;
  }> {
    // 1. Verificar si el email ya existe en la tabla User
    const existingUserByEmail = await this.userRepository.findOne({
      where: { email: registerDto.email }
    });

    let user: User;
    let worker: Worker | null = null;
    let isExistingWorker = false;
    let generatedPassword: string | undefined;

    // Verificar que el admin existe y es administrador
    const admin = await this.userRepository.findOne({
      where: { id: adminId, userType: 'adm' }
    });

    if (!admin) {
      throw new UnauthorizedException('Solo los administradores pueden registrar trabajadores');
    }

    // Buscar la compañía del administrador
    const company = await this.companyRepository.findOne({
      where: { userId: adminId }
    });

    if (!company) {
      throw new NotFoundException('El administrador no tiene una compañía asignada');
    }

    // ==================== VERIFICAR SI YA EXISTE EL TRABAJADOR ====================
    // Buscar si ya existe un trabajador con el mismo email
    if (existingUserByEmail) {
      // Si el usuario existe, verificar si ya es un trabajador
      if (existingUserByEmail.userType !== 'wrk') {
        throw new ConflictException('El email ya está registrado con un rol diferente (no trabajador)');
      }

      // Usuario existe y es trabajador (verificado o no)
      user = existingUserByEmail;
      isExistingWorker = true;

      // Verificar si el usuario ya está verificado
      if (existingUserByEmail.emailVerified === 0) {
        // Si no está verificado, enviar nuevo código
        await this.sendVerificationCode(registerDto.email);
        // NO lanzamos excepción, continuamos con el flujo
      }
    } else {
      // ==================== CREAR NUEVO TRABAJADOR ====================
      // Verificar si el username ya existe
      const existingUserByUsername = await this.userRepository.findOne({
        where: { username: registerDto.username }
      });

      if (existingUserByUsername) {
        throw new ConflictException('El nombre de usuario ya está en uso');
      }

      // Generar contraseña automáticamente
      generatedPassword = this.generateRandomPassword(12);

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
        company.name // Nombre de la compañía para el email
      );

      if (!credentialsSent) {
        console.warn('No se pudieron enviar las credenciales por correo, pero el usuario fue creado');
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
          'worker_photo',   // subcarpeta
          'worker',              // tipo de entidad
          user.id                // ID del usuario
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
        companyId: company.id
      }
    });

    // Buscar el perfil de worker
    worker = await this.workerRepository.findOne({
      where: { userId: user.id }
    });

    let createdWorkerProfile = false;
    let createdCompanyWorker = false;

    // Si no existe perfil de worker, crearlo
    if (!worker) {
      console.log(`Creando perfil de trabajador para usuario: ${user.email}`);

      const newWorker = this.workerRepository.create({
        name: registerDto.name,
        lastName: registerDto.lastName,
        phone: registerDto.phone,
        address: registerDto.address,
        birthdate: registerDto.birthdate,
        picture: pictureFileName,
        description: registerDto.description,
        isActive: 1,
        location: registerDto.location,
        userId: user.id
      });

      worker = await this.workerRepository.save(newWorker);
      createdWorkerProfile = true;

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
      createdCompanyWorker = true;
    }

    // No se genera token JWT en el registro de trabajador

    // Eliminar password del objeto de respuesta
    const { password, ...userWithoutPassword } = user;

    // ==================== CONSTRUIR MENSAJE DE RESPUESTA MEJORADO ====================
    let message: string;

    if (isExistingWorker) {
      // Usuario ya existente
      const actionParts: string[] = []; // <-- DECLARAR EXPLÍCITAMENTE COMO STRING[]

      // Determinar si hubo cambios
      const isVerified = user.emailVerified === 1;

      // Base del mensaje según estado de verificación
      if (!isVerified) {
        actionParts.push(`El trabajador ya estaba registrado en el sistema pero su correo no estaba verificado.`);
        actionParts.push(`Se ha enviado un nuevo código de verificación para completar este proceso.`);
      } else {
        actionParts.push(`El trabajador ya estaba registrado y verificado en el sistema.`);
      }

      // Agregar detalles específicos
      if (createdWorkerProfile) {
        actionParts.push(`Se ha completado su perfil profesional con la información proporcionada.`);
      }

      if (createdCompanyWorker) {
        actionParts.push(`Ha sido asignado exitosamente a la compañía '${company.name}'.`);
      } else if (existingAssignment) {
        actionParts.push(`Ya se encontraba asignado a la compañía '${company.name}'.`);
      }

      // Agregar recomendación si no está verificado
      if (!isVerified) {
        actionParts.push(`Una vez que verifique su correo electrónico, podrá acceder a todas las funcionalidades.`);
      }

      message = actionParts.join(' ');
    } else {
      // Usuario nuevo
      const newUserParts = [
        `Trabajador registrado exitosamente en el sistema CLYPS.`,
        `Ha sido asignado a la compañía '${company.name}'.`,
        `Las credenciales de acceso han sido enviadas a su correo electrónico.`,
        `Para activar su cuenta, por favor verifique su correo utilizando el código enviado.`
      ];
      message = newUserParts.join(' ');
    }

    // Construir objeto de respuesta
    const response: any = {
      message,
      user: userWithoutPassword,
    };


    return response;
  }


  /**
  * Registro específico para clientes CON CONTRASEÑA AUTOMÁTICA
  */
  async registerClient(registerDto: RegisterClientDto, pictureFile?: Express.Multer.File): Promise<{
    message: string;
    user: Partial<User>;
    generatedPassword?: string;
    access_token?: string;
  }> {

    // 1. Verificar si el correo ya existe en la tabla User
    const existingUserByEmail = await this.userRepository.findOne({
      where: { email: registerDto.email }
    });

    let user: User;
    let client: Client | null = null;
    let isExistingUser = false;
    let generatedPassword: string | undefined;

    // ==================== VERIFICAR SI YA EXISTE EL USUARIO ====================
    if (existingUserByEmail) {
      if (existingUserByEmail.userType !== 'cli') {
        throw new ConflictException('El email ya está registrado con un rol diferente (no cliente)');
      }

      user = existingUserByEmail;
      isExistingUser = true;

      if (existingUserByEmail.emailVerified === 0) {
        await this.sendVerificationCode(registerDto.email);
      }
    } else {
      // ==================== CREAR NUEVO USUARIO ====================
      const existingUserByUsername = await this.userRepository.findOne({
        where: { username: registerDto.username }
      });

      if (existingUserByUsername) {
        throw new ConflictException('El nombre de usuario ya está en uso');
      }

      generatedPassword = this.generateRandomPassword(12);
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      const newUser = this.userRepository.create({
        username: registerDto.username,
        email: registerDto.email,
        password: hashedPassword,
        userType: 'cli',
        emailVerified: 0,
      });

      user = await this.userRepository.save(newUser);



      const credentialsSent = await this.emailService.sendClientCredentials(
        user.email,
        user.username,
        generatedPassword
      );

      if (!credentialsSent) {
        console.warn('No se pudieron enviar las credenciales por correo, pero el usuario fue creado');
      }

      await this.sendVerificationCode(user.email);
    }

    // ==================== [NUEVO] PROCESAR ARCHIVO DE FOTO (SI SE ENVIÓ) ====================
    let pictureFileName: string | undefined;
    if (pictureFile) {
      try {
        const fileInfo = await this.fileUploadService.saveFile(
          pictureFile,
          'client_photo',   // subcarpeta
          'client',              // tipo de entidad
          user.id                // ID del usuario
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
      where: { userId: user.id }
    });

    let createdClientProfile = false;
    let updatedClientProfile = false;
    let addedNewCompanies = false;

    if (!client) {
      // Crear nuevo perfil de cliente
      console.log(`Creando perfil de cliente para usuario: ${user.email}`);

      const newClient = this.clientRepository.create({
        name: registerDto.name,
        lastName: registerDto.lastName,
        email: registerDto.email,
        phone: registerDto.phone,
        birthDate: registerDto.birthdate,
        picture: pictureFileName ,
        isActive: registerDto.isActive !== undefined ? registerDto.isActive : 1,
        companies: [],
        location: registerDto.location,
        userId: user.id
      });

      client = await this.clientRepository.save(newClient);
      createdClientProfile = true;
      console.log(`Perfil de cliente creado con ID: ${client.id}`);
    } else {
      // ==================== VERIFICAR SI HAY CAMBIOS REALES ====================
      console.log(`Verificando cambios para cliente existente: ${user.email}`);

      // Preparar objeto con solo los campos que vienen en el DTO (no undefined)
      const updateData: any = {};
      let hasChanges = false;

      // Comparar cada campo individualmente, solo si viene en el DTO
      if (registerDto.name !== undefined && registerDto.name !== client.name) {
        updateData.name = registerDto.name;
        hasChanges = true;
        console.log(`Cambio detectado en nombre: ${client.name} -> ${registerDto.name}`);
      }

      if (registerDto.lastName !== undefined && registerDto.lastName !== client.lastName) {
        updateData.lastName = registerDto.lastName;
        hasChanges = true;
        console.log(`Cambio detectado en apellido: ${client.lastName} -> ${registerDto.lastName}`);
      }

      if (registerDto.email !== undefined && registerDto.email !== client.email) {
        updateData.email = registerDto.email;
        hasChanges = true;
        console.log(`Cambio detectado en email: ${client.email} -> ${registerDto.email}`);
      }

      if (registerDto.phone !== undefined && registerDto.phone !== client.phone) {
        updateData.phone = registerDto.phone;
        hasChanges = true;
        console.log(`Cambio detectado en teléfono: ${client.phone} -> ${registerDto.phone}`);
      }

      if (registerDto.birthdate !== undefined) {
        const currentBirthDate = client.birthDate ? new Date(client.birthDate).toISOString().split('T')[0] : null;
        const newBirthDate = registerDto.birthdate ? new Date(registerDto.birthdate).toISOString().split('T')[0] : null;

        if (currentBirthDate !== newBirthDate) {
          updateData.birthDate = registerDto.birthdate;
          hasChanges = true;
          console.log(`Cambio detectado en fecha de nacimiento: ${currentBirthDate} -> ${newBirthDate}`);
        }
      }



      if (pictureFileName) {
        updateData.picture = pictureFileName;
        hasChanges = true;
        console.log(`Cambio detectado en foto (archivo): ${client.picture} -> ${pictureFileName}`);
      }

      if (registerDto.isActive !== undefined && registerDto.isActive !== client.isActive) {
        updateData.isActive = registerDto.isActive;
        hasChanges = true;
        console.log(`Cambio detectado en estado activo: ${client.isActive} -> ${registerDto.isActive}`);
      }

      if (registerDto.location !== undefined && registerDto.location !== client.location) {
        updateData.location = registerDto.location;
        hasChanges = true;
        console.log(`Cambio detectado en ubicación: ${client.location} -> ${registerDto.location}`);
      }


      // Solo actualizar si hay cambios reales
      if (hasChanges) {
        console.log(`Detectados cambios reales. Actualizando perfil del cliente...`);

        // Aplicar actualizaciones
        await this.clientRepository.update(client.id, updateData);
        updatedClientProfile = true;

        // Recargar el cliente actualizado
        client = await this.clientRepository.findOne({
          where: { id: client.id }
        });

        console.log(`Perfil de cliente actualizado exitosamente.`);
      } else {
        console.log(`No se detectaron cambios reales en el perfil del cliente. No se realizaron actualizaciones.`);
      }
    }


    // Eliminar password del objeto de respuesta
    const { password, ...userWithoutPassword } = user;

    // ==================== CONSTRUIR MENSAJE DE RESPUESTA ====================
    const actionParts: string[] = [];

    if (isExistingUser) {
      const isVerified = user.emailVerified === 1;

      if (!createdClientProfile && !updatedClientProfile) {
        // No hubo cambios en el perfil
        if (isVerified) {
          actionParts.push(`El cliente ya estaba registrado y verificado en el sistema.`);
        } else {
          actionParts.push(`El cliente ya estaba registrado en el sistema pero su correo no estaba verificado.`);
          actionParts.push(`Se ha enviado un nuevo código de verificación para completar este proceso.`);
        }

        // CORRECCIÓN: Verificar que client no sea null y que companies exista
        if (client && Array.isArray(client.companies) && client.companies.length > 0) {
          actionParts.push(`El cliente mantiene sus ${client.companies.length} compañía(s) actuales sin cambios.`);
        }
      } else {
        // Hubo cambios en el perfil
        if (createdClientProfile) {
          actionParts.push(`Se completó el perfil del cliente con la información proporcionada.`);
        } else if (updatedClientProfile) {
          actionParts.push(`Se actualizó el perfil del cliente con la nueva información.`);
        }

        if (addedNewCompanies) {
          actionParts.push(`Se agregaron nuevas compañías al perfil del cliente.`);
        }
      }
    } else {
      // Nuevo cliente
      actionParts.push(`Cliente registrado exitosamente en el sistema CLYPS.`);
      actionParts.push(`Las credenciales de acceso han sido enviadas a su correo electrónico.`);
      actionParts.push(`Para activar su cuenta, por favor verifique su correo utilizando el código enviado.`);

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
        noChangesDetected: isExistingUser && !createdClientProfile && !updatedClientProfile
      }
    };

    return response;
  }
  /**
   * Registro de cliente por parte del administrador de la compañía
   */
  async registerClientByAdmin(
    registerDto: RegisterClientDto,
    adminId: number,
    pictureFile?: Express.Multer.File,
  ): Promise<{ message: string; user: Partial<User>; generatedPassword?: string }> {
    // 1. Validar que el admin existe y tiene compañía
    const admin = await this.userRepository.findOne({
      where: { id: adminId, userType: 'adm' },
    });
    if (!admin) {
      throw new UnauthorizedException('Solo los administradores pueden registrar clientes');
    }

    const company = await this.companyRepository.findOne({ where: { userId: adminId } });
    if (!company) {
      throw new NotFoundException('El administrador no tiene una compañía asignada');
    }

    // 2. Verificar email
    const existingUserByEmail = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    let user: User;
    let client: Client | null = null;
    let isExistingUser = false;
    let generatedPassword: string | undefined;

    if (existingUserByEmail) {
      if (existingUserByEmail.userType !== 'cli') {
        throw new ConflictException('El email ya está registrado con un rol diferente (no cliente)');
      }
      user = existingUserByEmail;
      isExistingUser = true;
    } else {
      const existingByUsername = await this.userRepository.findOne({
        where: { username: registerDto.username },
      });
      if (existingByUsername) {
        throw new ConflictException('El nombre de usuario ya está en uso');
      }

      generatedPassword = this.generateRandomPassword(12);
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      const newUser = this.userRepository.create({
        username: registerDto.username,
        email: registerDto.email,
        password: hashedPassword,
        userType: 'cli',
        emailVerified: 0,
      });
      user = await this.userRepository.save(newUser);

      await this.emailService.sendClientCredentials(user.email, user.username, generatedPassword);
      await this.sendVerificationCode(user.email);
    }

    // 3. Procesar foto
    let pictureFileName: string | undefined;
    if (pictureFile) {
      try {
        const fileInfo = await this.fileUploadService.saveFile(pictureFile, 'client_photo', 'client', user.id);
        pictureFileName = fileInfo.fileName;
      } catch (error) {
        console.error('Error al guardar foto de cliente:', error);
      }
    }

    // 4. Crear o actualizar perfil del cliente
    client = await this.clientRepository.findOne({ where: { userId: user.id } });

    if (!client) {
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
      });
      client = await this.clientRepository.save(newClient);
    } else {
      // Agregar compañía si aún no está en el array
      const currentCompanies: number[] = Array.isArray(client.companies) ? client.companies : [];
      if (!currentCompanies.includes(company.id)) {
        currentCompanies.push(company.id);
        await this.clientRepository.update(client.id, { companies: currentCompanies });
      }
    }

    const { password, ...userWithoutPassword } = user;

    const message = isExistingUser
      ? `Cliente existente vinculado a la compañía '${company.name}' exitosamente.`
      : `Cliente registrado exitosamente y vinculado a la compañía '${company.name}'. Las credenciales fueron enviadas a su correo.`;

    return { message, user: userWithoutPassword, generatedPassword };
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