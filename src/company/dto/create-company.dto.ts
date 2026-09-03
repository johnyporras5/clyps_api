import {
  IsOptional,
  IsEmail,
  IsNotEmpty,
  IsString,
  IsNumber,
  IsDateString,
} from 'class-validator';

export class CreateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  address?: string;

  /**
   * OBLIGATORIO. Es el correo de la compañía y el que se usa para facturar:
   * Cobrix identifica al cliente con él y sin correo no emite el cobro
   * (SUB-10). El registro ya lo manda —es el mismo del dueño—, así que exigirlo
   * aquí solo cierra la puerta a crear compañías sin él por la API.
   */
  @IsEmail()
  @IsNotEmpty({ message: 'El correo de la compañía es obligatorio' })
  email: string;

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
}
