import { Injectable, BadRequestException, Logger, Inject } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

export type AllowedFolder = 
  | 'user_photo' 
  | 'training_plan_photo' 
  | 'exercise_photo' 
  | 'profile_photos'
  | 'client_photo'
  | 'company_logo';

export interface FileInfo {
  fileName: string;
  fileUrl: string;
  filePath: string;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly assetsPath: string;
  private readonly assetsBaseUrl: string;

  // Tipos de carpetas permitidas
  private readonly allowedFolders: AllowedFolder[] = [
    'user_photo',
    'training_plan_photo',
    'exercise_photo',
    'profile_photos',
    'client_photo',
    'company_logo',
  ];

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {
    this.assetsPath = path.join(process.cwd(), 'assets');
    
    // Obtener la URL base desde las variables de entorno con valor por defecto
    this.assetsBaseUrl = this.configService.get<string>('ASSETS_BASE_URL') || 'http://localhost:4000/assets';

    this.logger.log(`📁 Ruta de assets: ${this.assetsPath}`);
    this.logger.log(`🌐 URL base de assets: ${this.assetsBaseUrl}`);

    this.createDirectories();
  }

  private createDirectories() {
    // Crear directorio raíz de assets si no existe
    if (!fs.existsSync(this.assetsPath)) {
      fs.mkdirSync(this.assetsPath, { recursive: true });
    }

    // Crear todos los directorios permitidos
    this.allowedFolders.forEach(folder => {
      const dirPath = path.join(this.assetsPath, folder);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });
  }

  async saveFile(
    file: Express.Multer.File,
    folder: AllowedFolder,
    entityType: string,
    entityId: number
  ): Promise<FileInfo> {
    try {
      // Validar que la carpeta sea permitida
      if (!this.allowedFolders.includes(folder)) {
        throw new BadRequestException(`Carpeta '${folder}' no permitida. Carpetas permitidas: ${this.allowedFolders.join(', ')}`);
      }

      // Validar que sea una imagen
      if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException('Solo se permiten archivos de imagen');
      }

      // Generar nombre único para el archivo
      const fileExtension = path.extname(file.originalname) || this.getExtensionFromMimeType(file.mimetype);
      const sanitizedEntityType = entityType.replace(/[^a-zA-Z0-9-_]/g, '');
      const fileName = `${sanitizedEntityType}-${entityId}-${uuidv4()}${fileExtension}`;
      const filePath = path.join(this.assetsPath, folder, fileName);

      // Guardar archivo
      fs.writeFileSync(filePath, file.buffer);

      // Generar URL completa
      const fileUrl = this.getFileUrl(folder, fileName);

      this.logger.log(`✅ Archivo guardado: ${filePath}`);
      this.logger.log(`🔗 URL generada: ${fileUrl}`);

      return {
        fileName,
        fileUrl,
        filePath
      };
    } catch (error) {
      this.logger.error(`❌ Error al guardar el archivo: ${error.message}`);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(`Error al guardar el archivo: ${error.message}`);
    }
  }

  getFileUrl(folder: string, fileName: string): string {
    // Validar que el folder sea seguro
    const safeFolder = folder.replace(/\.\./g, '').replace(/\//g, '');
    const safeFileName = fileName.replace(/\.\./g, '').replace(/\//g, '');
    
    return `${this.assetsBaseUrl}/${safeFolder}/${safeFileName}`;
  }

  deleteFile(folder: string, fileName: string): boolean {
    try {
      const filePath = path.join(this.assetsPath, folder, fileName);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`🗑️  Archivo eliminado: ${filePath}`);
        return true;
      }
      
      this.logger.warn(`⚠️  Archivo no encontrado para eliminar: ${filePath}`);
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
      'image/svg+xml': '.svg'
    };

    return mimeToExt[mimeType] || '.jpg';
  }
}