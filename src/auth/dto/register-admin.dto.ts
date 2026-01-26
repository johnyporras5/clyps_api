import { IsEmail, IsNotEmpty, IsString, MinLength,IsOptional } from 'class-validator';

export class RegisterAdminDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;


}