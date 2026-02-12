import { IsOptional, IsEmail, IsString, IsIn, IsNumber, IsArray, Min, Max, IsInt, Length, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateClientDto {

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
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

  /*@IsOptional()
  @IsArray()
  @IsInt({ each: true })
  companies?: number[] = [];*/


}
