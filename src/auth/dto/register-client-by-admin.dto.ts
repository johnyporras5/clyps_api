import {
  IsOptional,
  IsString,
  IsDate,
  Length,
  IsNotEmpty,
  IsEmail,
  IsNumber,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * El email se considera "no disponible" cuando no se envía, viene vacío o el
 * front manda explícitamente el texto "no disponible". En ese caso el alta se
 * permite sin email y la unicidad se valida por `username`.
 */
export function isEmailUnavailable(email?: string | null): boolean {
  if (email === undefined || email === null) return true;
  const v = email.trim().toLowerCase();
  return v === '' || v === 'no disponible';
}

/**
 * Alta de cliente por parte del admin. A diferencia del registro público,
 * el email es OPCIONAL: un negocio puede registrar clientes que no tienen
 * correo. La identidad única se garantiza por `username`.
 */
export class RegisterClientByAdminDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  // Opcional. Si viene un email "real" (no vacío ni "no disponible"), se valida
  // su formato; si no, se acepta como "no disponible".
  @IsOptional()
  @ValidateIf((o) => !isEmailUnavailable(o.email))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(8, 100)
  password?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  phone?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthdate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  isActive?: number = 1;

  @IsOptional()
  @IsString()
  location?: string;
}
