import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsEmail,
  IsDateString,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  MaxLength,
} from 'class-validator';

export class UpdateAdminProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsString()
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  tiktokUrl?: string;

  @IsOptional()
  @IsString()
  facebookUrl?: string;

  @IsOptional()
  calendarDetail?: any;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  // Permite al admin registrar citas con fecha pasada (se crean en Completada).
  // Llega como string por multipart ('true'/'false'). Se tipa string a propósito:
  // con enableImplicitConversion, un campo boolean convertiría 'false' → true. La
  // interpretación a boolean se hace en el service.
  @IsOptional()
  @IsString()
  allowPastAppointments?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // Si el JSON no parsea, se intenta el split por comas más abajo.
        }
      }
      return trimmed
        .split(',')
        .map((item) => item.trim().replace(/^["']|["']$/g, ''));
    }
    return value;
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique({ message: 'Las categorías no pueden duplicarse' })
  @IsString({ each: true })
  @MaxLength(145, { each: true })
  categories?: string[];
}
