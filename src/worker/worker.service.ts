import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker } from './entities/worker.entity';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { UpdateWorkerByAdminDto } from './dto/update-worker-by-admin.dto';
import { User } from '../user/entities/user.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { Company } from '../company/entities/company.entity';
import {
  FileUploadService,
  AllowedFolder,
} from '../common/services/file_upload.service';
import { PhotoWithUrl } from '../worker/types/photo_with_url.type';
import { WorkerFeedback } from 'src/worker_feedback/entities/worker_feedback.entity';
import { FeedbackSummary } from './types/feedback_summary.type';
import { CalendarCompany } from '../calendar_company/entities/calendar-company.entity';
import { WorkerCalendarDto } from './dto/update-worker-calendar.dto';

/** Nombres de días en español para los mensajes de validación del horario. */
const DAY_LABELS_ES: Record<string, string> = {
  monday: 'lunes',
  tuesday: 'martes',
  wednesday: 'miércoles',
  thursday: 'jueves',
  friday: 'viernes',
  saturday: 'sábado',
  sunday: 'domingo',
};

@Injectable()
export class WorkerService {
  private readonly WORKER_PHOTO_FOLDER: AllowedFolder = 'worker_photo';
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    @InjectRepository(Worker)
    private workerRepository: Repository<Worker>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(CompanyWorker)
    private companyWorkerRepository: Repository<CompanyWorker>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(WorkerFeedback) // <<-- agregar
    private workerFeedbackRepository: Repository<WorkerFeedback>,
    @InjectRepository(CalendarCompany)
    private calendarCompanyRepository: Repository<CalendarCompany>,
    @Inject(FileUploadService)
    private fileUploadService: FileUploadService,
  ) {}

  async findOne(
    id: number,
    userId?: number,
    userType?: string,
  ): Promise<PhotoWithUrl & { feedbackSummary?: FeedbackSummary }> {
    const worker = await this.workerRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!worker) {
      throw new NotFoundException(`Worker with id ${id} not found`);
    }

    if (userId && userType) {
      const canView =
        userType === 'adm' || userType === 'cli' || worker.userId === userId;
      if (!canView) {
        throw new UnauthorizedException(
          'No tienes permiso para ver este perfil',
        );
      }
    }

    const photoUrl = await this.getWorkerPhotoUrl(worker.id);
    const userWithoutPassword = this.excludePasswordFromUser(worker.user);
    const feedbackSummary = await this.getFeedbackSummary(worker.id, 5);

    const companyWorkerWhere: {
      workerId: number;
      companyId?: number;
      isActive: number;
      temporarilyDeleted: boolean;
      permanentlyDeleted: boolean;
    } = {
      workerId: id,
      isActive: 1,
      temporarilyDeleted: false,
      permanentlyDeleted: false,
    };
    if (userType === 'adm' && userId) {
      const adminCompany = await this.companyRepository.findOne({
        where: { userId },
      });
      if (adminCompany) {
        companyWorkerWhere.companyId = adminCompany.id;
      }
    }

    const companyWorker = await this.companyWorkerRepository.findOne({
      where: companyWorkerWhere,
      relations: ['company'],
    });

    return {
      ...worker,
      photoUrl,
      user: userWithoutPassword,
      feedbackSummary,
      companyWorker: companyWorker ?? null,
    };
  }

  async findByUserId(
    userId: number,
  ): Promise<PhotoWithUrl & { feedbackSummary?: FeedbackSummary }> {
    const worker = await this.workerRepository.findOne({
      where: { userId },
      relations: ['user'],
    });

    if (!worker) {
      throw new NotFoundException(
        `Worker profile for user ${userId} not found`,
      );
    }
    const photoUrl = await this.getWorkerPhotoUrl(worker.id);
    const userWithoutPassword = this.excludePasswordFromUser(worker.user);
    const feedbackSummary = await this.getFeedbackSummary(worker.id, 5);

    // companyWorker de su empresa activa: permite al front leer su propio
    // horario desde el perfil, sin una segunda llamada a GET /workers/:id.
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: {
        workerId: worker.id,
        isActive: 1,
        temporarilyDeleted: false,
        permanentlyDeleted: false,
      },
    });

    return {
      ...worker,
      photoUrl,
      user: userWithoutPassword,
      feedbackSummary,
      companyWorker: companyWorker ?? null,
    };
  }

  async create(createWorkerDto: CreateWorkerDto): Promise<Worker> {
    // Verificar que el usuario existe y es de tipo 'wrk'
    const user = await this.userRepository.findOne({
      where: { id: createWorkerDto.userId },
    });

    if (!user) {
      throw new NotFoundException(
        `User with id ${createWorkerDto.userId} not found`,
      );
    }

    if (user.userType !== 'wrk') {
      throw new BadRequestException('User must be of type worker');
    }

    // Verificar que no exista ya un worker para este usuario
    const existingWorker = await this.workerRepository.findOne({
      where: { userId: createWorkerDto.userId },
    });

    if (existingWorker) {
      throw new ConflictException(
        'Worker profile already exists for this user',
      );
    }

    const worker = this.workerRepository.create(createWorkerDto);
    return await this.workerRepository.save(worker);
  }

  async update(
    id: number,
    updateWorkerDto: UpdateWorkerDto,
    userId: number,
  ): Promise<Worker> {
    const worker = await this.workerRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!worker) {
      throw new NotFoundException(`Worker with id ${id} not found`);
    }

    // Verificar que el usuario autenticado sea el dueño del perfil
    if (worker.userId !== userId) {
      throw new UnauthorizedException(
        'No tienes permiso para actualizar este perfil',
      );
    }

    Object.assign(worker, updateWorkerDto);
    return await this.workerRepository.save(worker);
  }

  /**
   * Actualizar perfil del trabajador con posibilidad de subir foto
   * @param userId ID del usuario trabajador
   * @param updateWorkerDto Datos a actualizar
   * @param photoFile Archivo de foto (opcional)
   * @returns Trabajador actualizado
   */
  async updateProfileWithPhoto(
    userId: number,
    updateWorkerDto: UpdateWorkerDto,
    photoFile?: Express.Multer.File,
  ): Promise<Worker> {
    // 1. Buscar el trabajador por userId
    const worker = await this.workerRepository.findOne({
      where: { userId },
      relations: ['user'],
    });

    if (!worker) {
      throw new NotFoundException(
        `Perfil de trabajador para el usuario ${userId} no encontrado`,
      );
    }

    // 2. Procesar foto si se proporciona
    if (photoFile) {
      try {
        // Guardar la nueva foto
        const photoInfo = await this.fileUploadService.saveFile(
          photoFile,
          this.WORKER_PHOTO_FOLDER,
          'worker',
          userId,
        );

        // Eliminar la foto anterior si existe
        if (worker.picture) {
          await this.fileUploadService.deleteFile(
            this.WORKER_PHOTO_FOLDER,
            worker.picture,
          );
        }

        // Actualizar el nombre del archivo en el DTO
        updateWorkerDto.picture = photoInfo.fileName;
      } catch (error) {
        console.error('Error al guardar la foto:', error);
        throw new BadRequestException('Error al guardar la foto del perfil');
      }
    }

    // 3. Actualizar campos del trabajador (excluyendo userId y campos protegidos)
    const allowedFields = [
      'name',
      'phone',
      'address',
      'birthdate',
      'picture',
      'description',
      'location',
      'isActive',
      'instagramUrl',
      'tiktokUrl',
      'facebookUrl',
    ];

    // Filtrar solo los campos permitidos
    const updates: Partial<Worker> = {};
    Object.keys(updateWorkerDto).forEach((key) => {
      if (allowedFields.includes(key) && updateWorkerDto[key] !== undefined) {
        updates[key] = updateWorkerDto[key];
      }
    });

    // 4. Advertencia si se intentó modificar campos restringidos
    const restrictedFields = ['id', 'userId', 'user'];
    const attemptedRestrictedUpdates = Object.keys(updateWorkerDto).filter(
      (key) =>
        restrictedFields.includes(key) && updateWorkerDto[key] !== undefined,
    );

    if (attemptedRestrictedUpdates.length > 0) {
      console.warn(
        'Intento de modificación de campos restringidos ignorado:',
        attemptedRestrictedUpdates,
      );
    }

    // 5. Aplicar actualizaciones y guardar
    Object.assign(worker, updates);
    return await this.workerRepository.save(worker);
  }

  /**
   * Obtener URL completa de la foto del trabajador
   * @param workerId ID del trabajador
   * @returns URL completa de la foto
   */
  async getWorkerPhotoUrl(workerId: number): Promise<string> {
    const worker = await this.workerRepository.findOne({
      where: { id: workerId },
    });

    if (!worker) {
      throw new NotFoundException(
        `Trabajador con ID ${workerId} no encontrado`,
      );
    }

    if (!worker.picture) {
      return '';
    }

    return this.fileUploadService.getFileUrl(
      this.WORKER_PHOTO_FOLDER,
      worker.picture,
    );
  }

  /**
   * Actualizar información completa de un worker por el administrador:
   * cubre las tablas user, worker y company_worker.
   */
  async updateWorkerByAdmin(
    workerId: number,
    adminId: number,
    dto: UpdateWorkerByAdminDto,
    photoFile?: Express.Multer.File,
  ): Promise<{ worker: any; companyWorker: any }> {
    // 1. Obtener el worker
    const worker = await this.workerRepository.findOne({
      where: { id: workerId },
      relations: ['user'],
    });
    if (!worker) {
      throw new NotFoundException(
        `Trabajador con ID ${workerId} no encontrado`,
      );
    }

    // 2. Obtener la compañía del admin
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new NotFoundException(
        'El administrador no tiene una compañía asignada',
      );
    }

    // 3. Verificar que el worker pertenece a la compañía del admin
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: { workerId, companyId: company.id },
    });
    if (!companyWorker) {
      throw new NotFoundException(
        `El trabajador con ID ${workerId} no pertenece a tu compañía`,
      );
    }

    // 4. Procesar foto
    if (photoFile) {
      try {
        const photoInfo = await this.fileUploadService.saveFile(
          photoFile,
          this.WORKER_PHOTO_FOLDER,
          'worker',
          worker.userId,
        );
        if (worker.picture) {
          await this.fileUploadService.deleteFile(
            this.WORKER_PHOTO_FOLDER,
            worker.picture,
          );
        }
        dto.picture = photoInfo.fileName;
      } catch (error) {
        this.logger.error('Error al guardar la foto del trabajador:', error);
        throw new BadRequestException('Error al guardar la foto de perfil');
      }
    }

    // 5. Actualizar User (username / email)
    const userUpdates: Partial<User> = {};
    if (dto.username !== undefined) {
      const taken = await this.userRepository.findOne({
        where: { username: dto.username },
      });
      if (taken && taken.id !== worker.userId) {
        throw new BadRequestException('El nombre de usuario ya está en uso');
      }
      userUpdates.username = dto.username;
    }
    if (dto.email !== undefined) {
      const taken = await this.userRepository.findOne({
        where: { email: dto.email },
      });
      if (taken && taken.id !== worker.userId) {
        throw new BadRequestException('El email ya está registrado');
      }
      userUpdates.email = dto.email;
    }
    if (Object.keys(userUpdates).length > 0) {
      await this.userRepository.update(worker.userId, userUpdates);
    }

    // 6. Actualizar Worker
    const workerFields: (keyof UpdateWorkerByAdminDto)[] = [
      'name',
      'phone',
      'address',
      'birthdate',
      'description',
      'location',
      'picture',
      'instagramUrl',
      'tiktokUrl',
      'facebookUrl',
    ];
    const workerUpdates: Partial<Worker> = {};
    workerFields.forEach((key) => {
      if (dto[key] !== undefined) {
        let value = dto[key];
        if (key === 'birthdate' && typeof value === 'string')
          value = new Date(value);
        workerUpdates[key as string] = value;
      }
    });
    if (dto.isActive !== undefined) {
      workerUpdates['isActive'] = Number(dto.isActive);
    }
    if (Object.keys(workerUpdates).length > 0) {
      await this.workerRepository.update(worker.id, workerUpdates);
    }

    // 7. Actualizar CompanyWorker
    const cwUpdates: Partial<CompanyWorker> = {};
    if (dto.companyWorkerIsActive !== undefined)
      cwUpdates.isActive = Number(dto.companyWorkerIsActive);
    if (dto.startDate !== undefined) cwUpdates.startDate = dto.startDate;
    if (dto.endDate !== undefined) cwUpdates.endDate = dto.endDate;
    if (dto.servicesDetail !== undefined) {
      cwUpdates.servicesDetail =
        typeof dto.servicesDetail === 'string'
          ? JSON.parse(dto.servicesDetail)
          : dto.servicesDetail;
    }
    if (dto.calendar !== undefined) {
      cwUpdates.calendar =
        typeof dto.calendar === 'string'
          ? JSON.parse(dto.calendar)
          : dto.calendar;
    }
    if (Object.keys(cwUpdates).length > 0) {
      await this.companyWorkerRepository.update(companyWorker.id, cwUpdates);
    }

    // 8. Retornar datos actualizados
    const updatedWorker = await this.workerRepository.findOne({
      where: { id: workerId },
      relations: ['user'],
    });
    if (!updatedWorker) {
      throw new NotFoundException(
        `Trabajador con ID ${workerId} no encontrado`,
      );
    }
    const updatedCW = await this.companyWorkerRepository.findOne({
      where: { id: companyWorker.id },
    });

    const photoUrl = updatedWorker.picture
      ? this.fileUploadService.getFileUrl(
          this.WORKER_PHOTO_FOLDER,
          updatedWorker.picture,
        )
      : '';

    const { password: _, ...userWithoutPassword } = updatedWorker.user as any;

    return {
      worker: { ...updatedWorker, user: userWithoutPassword, photoUrl },
      companyWorker: updatedCW,
    };
  }

  /**
   * Actualizar el horario del propio trabajador autenticado.
   * Se guarda sobre el company_worker de su empresa activa, con la misma forma
   * que ya escribe el admin en `company_worker.calendar`.
   */
  async updateMyCalendar(
    userId: number,
    calendar: WorkerCalendarDto,
  ): Promise<CompanyWorker> {
    // 1. Worker del token
    const worker = await this.workerRepository.findOne({ where: { userId } });
    if (!worker) {
      throw new NotFoundException(
        `Perfil de trabajador para el usuario ${userId} no encontrado`,
      );
    }

    // 2. Su company_worker activo (empresa actual)
    const companyWorker = await this.companyWorkerRepository.findOne({
      where: {
        workerId: worker.id,
        isActive: 1,
        temporarilyDeleted: false,
        permanentlyDeleted: false,
      },
    });
    if (!companyWorker) {
      throw new NotFoundException(
        'No tienes una empresa activa asignada, no es posible guardar tu horario',
      );
    }

    // 3. Validar contra el horario del negocio (días y turnos; las horas son libres)
    await this.validateCalendarAgainstCompany(
      companyWorker.companyId,
      calendar,
    );

    // 4. Guardar
    await this.companyWorkerRepository.update(companyWorker.id, {
      calendar,
    } as Partial<CompanyWorker>);

    const updated = await this.companyWorkerRepository.findOne({
      where: { id: companyWorker.id },
    });
    if (!updated) {
      throw new NotFoundException(
        'No fue posible recuperar el horario guardado',
      );
    }
    return updated;
  }

  /**
   * Regla del editor del admin: el horario del trabajador no puede salirse de
   * los DÍAS ni de los TURNOS que abre la empresa.
   *
   * Las HORAS de cada turno son libres a propósito: hay trabajadores que
   * entran antes o salen después que el negocio y validarlas rompería horarios
   * ya existentes.
   */
  private async validateCalendarAgainstCompany(
    companyId: number,
    calendar: WorkerCalendarDto,
  ): Promise<void> {
    const companyCalendar = await this.calendarCompanyRepository.findOne({
      where: { companyId },
    });

    const schedule = this.getCompanySchedule(companyCalendar?.calendarDetail);
    // Si la empresa aún no configuró su horario no hay nada contra qué validar.
    if (!schedule) return;

    const companyDays: string[] = Array.isArray(schedule.days)
      ? schedule.days
      : [];
    const workerDays = calendar.days ?? [];

    const invalidDays = workerDays.filter((d) => !companyDays.includes(d));
    if (invalidDays.length > 0) {
      throw new BadRequestException(
        `Tu horario incluye días en los que el negocio no abre: ${invalidDays
          .map((d) => DAY_LABELS_ES[d] ?? d)
          .join(', ')}.`,
      );
    }

    if (calendar.morning && !this.hasShift(schedule.morning)) {
      throw new BadRequestException(
        'El negocio no abre en la mañana, no puedes tener un turno de mañana.',
      );
    }
    if (calendar.afternoon && !this.hasShift(schedule.afternoon)) {
      throw new BadRequestException(
        'El negocio no abre en la tarde, no puedes tener un turno de tarde.',
      );
    }
  }

  /**
   * El calendario de la compañía guarda el horario semanal anidado bajo
   * `schedule` (a diferencia del trabajador, que lo guarda plano). Se
   * contempla la forma plana como respaldo.
   */
  private getCompanySchedule(calendarDetail: any): any | null {
    let detail: any = calendarDetail;
    if (typeof detail === 'string') {
      try {
        detail = JSON.parse(detail);
      } catch {
        return null;
      }
    }
    if (!detail) return null;
    const schedule = detail.schedule ?? detail;
    if (!schedule || typeof schedule !== 'object') return null;
    return Array.isArray(schedule.days) ? schedule : null;
  }

  /** Un turno "existe" solo si trae start y end utilizables. */
  private hasShift(period: any): boolean {
    return Boolean(period?.start && period?.end);
  }

  // Método para verificar si un usuario es dueño del worker
  async isWorkerOwner(workerId: number, userId: number): Promise<boolean> {
    const worker = await this.workerRepository.findOne({
      where: { id: workerId, userId: userId },
    });

    return !!worker;
  }

  /**
   * Método auxiliar para excluir la contraseña del objeto usuario
   * @param user Objeto usuario (puede ser undefined)
   * @returns Objeto usuario sin contraseña o undefined
   */
  private excludePasswordFromUser(user?: User): any | undefined {
    if (!user) {
      return undefined;
    }

    // Crear un nuevo objeto con todas las propiedades excepto password
    const { password: _, ...userWithoutPassword } = user;

    return userWithoutPassword;
  }

  private async getFeedbackSummary(
    workerId: number,
    recentLimit = 5,
  ): Promise<FeedbackSummary> {
    // total y últimos reviews
    const [recentReviews, totalReviews] =
      await this.workerFeedbackRepository.findAndCount({
        where: { workerId },
        order: { datetime: 'DESC' },
        take: recentLimit,
      });

    // average usando query builder (más preciso en SQL)
    const raw = await this.workerFeedbackRepository
      .createQueryBuilder('f')
      .select('AVG(f.stars)', 'avg')
      .where('f.workerId = :workerId', { workerId })
      .getRawOne();

    const averageStars = raw && raw.avg ? parseFloat(raw.avg) : 0;

    return {
      averageStars: Math.round((averageStars + Number.EPSILON) * 100) / 100, // 2 decimales
      totalReviews,
      recentReviews,
    };
  }
}
