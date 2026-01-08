import { IsNotEmpty, IsOptional, IsEmail, IsString, IsBoolean, IsNumber, Length } from 'class-validator';

export class CreateWorkerDto {

  @IsNotEmpty()
  @IsNumber()
  userId: number; // Agregar esto

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
  @IsString()
  address?: string;

  @IsOptional()
  birthdate?: Date;

  @IsOptional()
  @IsString()
  picture?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
