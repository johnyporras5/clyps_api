import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class ExtraServiceItemDto {
  @IsNotEmpty()
  @IsNumber()
  serviceId: number;

  @IsNotEmpty()
  @IsString()
  serviceName: string;

  @IsNotEmpty()
  @IsNumber()
  providerId: number; // Este es el companyWorkerId

  @IsNotEmpty()
  @IsString()
  providerName: string;

  @IsNotEmpty()
  @IsString()
  date: string; // "2026-02-15"

  @IsNotEmpty()
  @IsString()
  time: string; // "9:30 AM"

  @IsNotEmpty()
  @IsNumber()
  durationMinutes: number;

  @IsNotEmpty()
  @IsEnum(['default', 'custom', 'free'])
  priceOption: 'default' | 'custom' | 'free';

  @IsNotEmpty()
  @IsNumber()
  price: number; // Precio final calculado

  @IsOptional()
  @IsNumber()
  customPrice?: number; // Solo si priceOption === "custom"

  @IsOptional()
  @IsString()
  createdAt?: string; // "2026-02-15T08:45:00.000Z"
}

export class AddExtraServicesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraServiceItemDto)
  extraServices: ExtraServiceItemDto[];
}