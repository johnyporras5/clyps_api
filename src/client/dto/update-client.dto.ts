import {
  IsOptional,
  IsEmail,
  IsString,
  IsIn,
  IsNumber,
  Length,
  IsDate,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { isEmailUnavailable } from '../../auth/dto/register-client-by-admin.dto';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  // En edición el admin puede enviar un email real (se valida su formato) o
  // "no disponible" (cliente sin correo).
  @IsOptional()
  @ValidateIf((o) => !isEmailUnavailable(o.email))
  @IsEmail()
  email?: string;
  @IsOptional()
  @IsString()
  @Length(0, 20)
  phone?: string;
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;

  @IsOptional()
  @IsString()
  picture?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  isActive?: number = 1;

  @IsOptional()
  @IsString()
  location?: string;

  /*@IsOptional()
  @IsArray()
  @IsInt({ each: true })
  companies?: number[] = [];*/
}
