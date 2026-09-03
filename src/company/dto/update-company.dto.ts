import {
  IsOptional,
  IsEmail,
  ValidateIf,
  IsString,
  IsNumber,
  IsDateString,
  IsBoolean,
} from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  address?: string;

  // Se puede omitir, pero no vaciar: el correo de la compañía es obligatorio.
  @ValidateIf((dto: UpdateCompanyDto) => dto.email !== undefined)
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  // Permite al admin registrar citas con fecha pasada (se crean en Completada).
  @IsOptional()
  @IsBoolean()
  allowPastAppointments?: boolean;
}
