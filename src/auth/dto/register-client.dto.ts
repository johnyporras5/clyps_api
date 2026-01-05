import { RegisterBaseDto } from './register-base.dto';
import { IsOptional, IsString } from 'class-validator';

export class RegisterClientDto extends RegisterBaseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  location?: string;
}