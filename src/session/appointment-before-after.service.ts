import type { UserRole } from '../auth/types/authenticated-request';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppointmentBeforeAfter } from './entities/appointment-before-after.entity';
import { SessionService } from './session.service';
import { FileUploadService } from '../common/services/file_upload.service';
import {
  AppointmentBeforeAfterResponse,
  BeforeAfterPhoto,
  BeforeAfterSlot,
} from './types/appointment-before-after.type';

@Injectable()
export class AppointmentBeforeAfterService {
  private readonly logger = new Logger(AppointmentBeforeAfterService.name);
  private readonly FOLDER = 'before_after';

  constructor(
    @InjectRepository(AppointmentBeforeAfter)
    private readonly repository: Repository<AppointmentBeforeAfter>,
    private readonly sessionService: SessionService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  /**
   * GET — registro "Antes y después" de la sesión.
   * Lectura: cliente dueño, worker asignado o admin de la compañía.
   */
  async getBeforeAfter(
    sessionId: number,
    userId: number,
    userRole: UserRole,
  ): Promise<AppointmentBeforeAfterResponse> {
    await this.sessionService.validateSessionAccess(
      sessionId,
      userId,
      userRole,
    );
    const record = await this.repository.findOne({ where: { sessionId } });
    return this.toResponse(sessionId, record);
  }

  /**
   * PUT — sube/reemplaza la foto de un slot.
   * Escritura: solo worker asignado o admin de la compañía.
   */
  async upsertSlot(
    sessionId: number,
    slot: string,
    file: Express.Multer.File,
    userId: number,
    userRole: UserRole,
  ): Promise<AppointmentBeforeAfterResponse> {
    const validSlot = this.assertSlot(slot);

    if (!file) {
      throw new BadRequestException('El campo "photo" es requerido');
    }
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      throw new BadRequestException('El archivo debe ser una imagen');
    }

    await this.sessionService.validateSessionAccess(
      sessionId,
      userId,
      userRole,
      true,
    );

    const record = await this.getOrCreateRecord(sessionId);
    const uploader = await this.sessionService.resolveUploaderInfo(
      userId,
      userRole,
    );

    // Guardar el nuevo archivo en el bucket/CDN.
    const fileInfo = await this.fileUploadService.saveFile(
      file,
      this.FOLDER,
      'session',
      sessionId,
    );

    // Si ya había foto en el slot, eliminar el archivo anterior.
    const previousFile =
      validSlot === 'before' ? record.beforePicture : record.afterPicture;
    if (previousFile) {
      await this.fileUploadService.deleteFile(this.FOLDER, previousFile);
    }

    const now = new Date();
    if (validSlot === 'before') {
      record.beforePicture = fileInfo.fileName;
      record.beforeUploadedAt = now;
      record.beforeUploadedById = Number(uploader.id);
      record.beforeUploadedByName = uploader.name;
    } else {
      record.afterPicture = fileInfo.fileName;
      record.afterUploadedAt = now;
      record.afterUploadedById = Number(uploader.id);
      record.afterUploadedByName = uploader.name;
    }

    const saved = await this.repository.save(record);
    return this.toResponse(sessionId, saved);
  }

  /**
   * DELETE — elimina la foto de un slot (lo deja en null).
   * Escritura: solo worker asignado o admin de la compañía.
   */
  async deleteSlot(
    sessionId: number,
    slot: string,
    userId: number,
    userRole: UserRole,
  ): Promise<AppointmentBeforeAfterResponse> {
    const validSlot = this.assertSlot(slot);

    await this.sessionService.validateSessionAccess(
      sessionId,
      userId,
      userRole,
      true,
    );

    const record = await this.repository.findOne({ where: { sessionId } });
    if (!record) {
      // No hay registro: el slot ya está en null, nada que borrar.
      return this.toResponse(sessionId, null);
    }

    const previousFile =
      validSlot === 'before' ? record.beforePicture : record.afterPicture;
    if (previousFile) {
      await this.fileUploadService.deleteFile(this.FOLDER, previousFile);
    }

    if (validSlot === 'before') {
      record.beforePicture = null;
      record.beforeUploadedAt = null;
      record.beforeUploadedById = null;
      record.beforeUploadedByName = null;
    } else {
      record.afterPicture = null;
      record.afterUploadedAt = null;
      record.afterUploadedById = null;
      record.afterUploadedByName = null;
    }

    const saved = await this.repository.save(record);
    return this.toResponse(sessionId, saved);
  }

  // ----- Helpers -----

  private assertSlot(slot: string): BeforeAfterSlot {
    if (slot !== 'before' && slot !== 'after') {
      throw new BadRequestException(
        `Slot inválido '${slot}'. Valores permitidos: before | after`,
      );
    }
    return slot;
  }

  private async getOrCreateRecord(
    sessionId: number,
  ): Promise<AppointmentBeforeAfter> {
    const existing = await this.repository.findOne({ where: { sessionId } });
    if (existing) return existing;
    return this.repository.create({ sessionId });
  }

  private toResponse(
    sessionId: number,
    record: AppointmentBeforeAfter | null,
  ): AppointmentBeforeAfterResponse {
    return {
      sessionId: String(sessionId),
      before: this.toPhoto(
        record?.beforePicture ?? null,
        record?.beforeUploadedAt ?? null,
        record?.beforeUploadedById ?? null,
        record?.beforeUploadedByName ?? null,
      ),
      after: this.toPhoto(
        record?.afterPicture ?? null,
        record?.afterUploadedAt ?? null,
        record?.afterUploadedById ?? null,
        record?.afterUploadedByName ?? null,
      ),
    };
  }

  private toPhoto(
    fileName: string | null,
    uploadedAt: Date | null,
    uploadedById: number | null,
    uploadedByName: string | null,
  ): BeforeAfterPhoto | null {
    if (!fileName) return null;
    return {
      url: this.fileUploadService.getFileUrl(this.FOLDER, fileName),
      uploadedAt: (uploadedAt ?? new Date()).toISOString(),
      uploadedBy: {
        id: uploadedById != null ? String(uploadedById) : '',
        name: uploadedByName ?? '',
      },
    };
  }
}
