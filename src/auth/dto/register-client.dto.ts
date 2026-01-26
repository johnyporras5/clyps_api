import { IsOptional, IsString, IsDate, Length, IsNotEmpty, IsEmail, IsNumber, IsIn, IsArray, Min, Max, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterClientDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

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


  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  companies?: number[] = [];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  isPublic?: number = 0;
}