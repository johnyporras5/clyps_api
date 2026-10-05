import {
  IsOptional,
  IsString,
  IsDate,
  Length,
  IsEmail,
  IsNotEmpty,
  IsJSON,
  IsNumber,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { isEmailUnavailable } from './register-client-by-admin.dto';
import { IdentificationField } from '../../common/utils/identification.util';

export class RegisterWorkerDto {
  // Cédula o RIF del trabajador. No se repite dentro del salón.
  @IdentificationField()
  identification?: string | null;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsOptional()
  @ValidateIf((o) => !isEmailUnavailable(o.email))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthdate?: Date;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  isActive?: number = 1;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsJSON()
  calendar?: any;
}
