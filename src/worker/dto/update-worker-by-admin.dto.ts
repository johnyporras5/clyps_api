import {
  IsOptional,
  IsString,
  IsDate,
  Length,
  IsNumber,
  IsIn,
  IsEmail,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateWorkerByAdminDto {
  // ── User ──────────────────────────────────────────
  @IsOptional()
  @IsString()
  @Length(1, 145)
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // ── Worker ────────────────────────────────────────
  @IsOptional()
  @IsString()
  @Length(1, 145)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-\s()]*$/, {
    message: 'El teléfono debe contener solo números y los caracteres: + - ( )',
  })
  @Length(8, 20)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 145)
  address?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthdate?: Date;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(1, 145)
  location?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  isActive?: number;

  @IsOptional()
  @IsString()
  @Length(0, 245)
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  @Length(0, 245)
  tiktokUrl?: string;

  @IsOptional()
  @IsString()
  @Length(0, 245)
  facebookUrl?: string;

  // Asignado internamente por el servicio al procesar el archivo
  @IsOptional()
  @IsString()
  picture?: string;

  // Campo del archivo multipart — lo maneja @UploadedFile(), se ignora aquí
  @IsOptional()
  photo?: any;

  // ── CompanyWorker ─────────────────────────────────
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  companyWorkerIsActive?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  servicesDetail?: any;

  @IsOptional()
  calendar?: any;
}
