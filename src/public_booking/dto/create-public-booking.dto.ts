import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Un servicio de la reserva pública. A diferencia del DTO interno, aquí el
 * trabajador y la hora son OBLIGATORIOS y no se aceptan estado, cortesía ni
 * fin explícito: eso lo decide el negocio, no quien reserva.
 */
export class PublicBookingDetailDto {
  @Type(() => Number)
  @IsInt()
  serviceId: number;

  @Type(() => Number)
  @IsInt()
  companyWorkerId: number;

  // Inicio del servicio, ISO UTC con Z (igual que la app del cliente).
  @IsDateString()
  detailStartDatetime: string;

  // Si el servicio se reserva a precio de oferta.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  offerId?: number;
}

export class CreatePublicBookingDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(145)
  name: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(145)
  email: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PublicBookingDetailDto)
  details: PublicBookingDetailDto[];

  // Anti-bots. `website` es un campo oculto que una persona nunca llena;
  // `elapsedMs` es cuánto tardó en completar el formulario.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  elapsedMs?: number;
}

export class PublicAvailabilityQueryDto {
  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyWorkerId?: number;
}
