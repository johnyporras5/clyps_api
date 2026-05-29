import {
  Injectable,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

export type AllowedFolder =
  | 'client_photo'
  | 'company_logo'
  | 'worker_photo'
  | 'portfolio'
  | 'offer_logo';

export interface FileInfo {
  fileName: string;
  fileUrl: string;
  filePath: string;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly assetsBaseUrl: string;
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly useSpaces: boolean;

  // Tipos de carpetas permitidas
  private readonly allowedFolders: AllowedFolder[] = [
    'client_photo',
    'company_logo',
    'worker_photo',
    'portfolio',
    'offer_logo',
  ];

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {
    // Obtener la URL base desde las variables de entorno con valor por defecto
    this.assetsBaseUrl =
      this.configService.get<string>('ASSETS_BASE_URL') ||
      'http://localhost:4000/assets';
    this.bucket = this.configService.get<string>('DO_SPACES_BUCKET') || 'clyps';

    // Verificar si se debe usar Digital Ocean Spaces
    const endpoint = this.configService.get<string>('DO_SPACES_ENDPOINT');
    const accessKey = this.configService.get<string>('DO_SPACES_ACCESS_KEY');
    const secretKey = this.configService.get<string>('DO_SPACES_SECRET_KEY');
    const region = this.configService.get<string>('DO_SPACES_REGION') || 'sfo3';

    this.useSpaces = !!(endpoint && accessKey && secretKey);

    if (this.useSpaces) {
      this.s3Client = new S3Client({
        region,
        endpoint: endpoint!,
        credentials: {
          accessKeyId: accessKey!,
          secretAccessKey: secretKey!,
        },
      });
      this.logger.log(`☁️ Usando Digital Ocean Spaces`);
      this.logger.log(`📦 Bucket: ${this.bucket}`);
      this.logger.log(`🌐 URL base: ${this.assetsBaseUrl}`);
    } else {
      this.logger.warn(
        `⚠️ Digital Ocean Spaces no configurado, modo local deshabilitado`,
      );
    }
  }

  async saveFile(
    file: Express.Multer.File,
    folder: AllowedFolder,
    entityType: string,
    entityId: number,
  ): Promise<FileInfo> {
    try {
      // Validar que la carpeta sea permitida
      if (!this.allowedFolders.includes(folder)) {
        throw new BadRequestException(
          `Carpeta '${folder}' no permitida. Carpetas permitidas: ${this.allowedFolders.join(', ')}`,
        );
      }

      // Validar que sea una imagen
      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        this.logger.error(
          `❌ Tipo de archivo no permitido: ${file.mimetype || 'sin mimetype'}`,
        );
        throw new BadRequestException('Solo se permiten archivos de imagen');
      }

      // Generar nombre único para el archivo
      const fileExtension = this.getExtensionFromMimeType(file.mimetype);
      const sanitizedEntityType = entityType.replace(/[^a-zA-Z0-9-_]/g, '');
      const fileName = `${sanitizedEntityType}-${entityId}-${uuidv4()}${fileExtension}`;
      const key = `${folder}/${fileName}`;

      if (this.useSpaces) {
        // Guardar en Digital Ocean Spaces
        const command = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: 'public-read',
        });

        await this.s3Client.send(command);
        this.logger.log(`☁️ Archivo subido a Spaces: ${key}`);
      } else {
        throw new BadRequestException(
          'Digital Ocean Spaces no está configurado',
        );
      }

      // Generar URL completa
      const fileUrl = this.getFileUrl(folder, fileName);

      this.logger.log(`✅ Archivo guardado: ${fileName}`);
      this.logger.log(`🔗 URL generada: ${fileUrl}`);

      return {
        fileName,
        fileUrl,
        filePath: key,
      };
    } catch (error) {
      this.logger.error(`❌ Error al guardar el archivo: ${error.message}`);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Error al guardar el archivo: ${error.message}`,
      );
    }
  }

  getFileUrl(folder: string, fileName: string): string {
    // Validar que el folder sea seguro
    const safeFolder = folder.replace(/\.\./g, '').replace(/\//g, '');
    const safeFileName = fileName.replace(/\.\./g, '').replace(/\//g, '');

    return `${this.assetsBaseUrl}/${safeFolder}/${safeFileName}`;
  }

  async deleteFile(folder: string, fileName: string): Promise<boolean> {
    try {
      if (this.useSpaces) {
        const key = `${folder}/${fileName}`;
        const command = new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });

        await this.s3Client.send(command);
        this.logger.log(`🗑️ Archivo eliminado de Spaces: ${key}`);
        return true;
      }

      this.logger.warn(`⚠️ Digital Ocean Spaces no configurado`);
      return false;
    } catch (error) {
      this.logger.error(`❌ Error al eliminar archivo ${fileName}:`, error);
      return false;
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };

    return mimeToExt[mimeType] || '.jpg';
  }
}
