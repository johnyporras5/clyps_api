import {
  IsOptional,
  IsNumber,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsString,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SessionDetailItemDto {
  @IsNotEmpty()
  @IsNumber()
  serviceId: number;

  // Puede venir null/undefined cuando la cita se crea sin trabajador asignado.
  // En ese caso offerId es obligatorio (ver regla debajo).
  @IsOptional()
  @IsNumber()
  companyWorkerId?: number | null;


  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionIA?: string;

  @IsOptional()
  detailStartDatetime?: Date;

  @IsOptional()
  @IsNumber()
  detailStatus?: number;

  // offerId:
  //  - si companyWorkerId NO se proporciona → offerId es REQUERIDO y numérico.
  //  - si companyWorkerId se proporciona → offerId es opcional, pero si se
  //    envía debe ser numérico.
  @ValidateIf(
    (o) =>
      o.companyWorkerId === null ||
      o.companyWorkerId === undefined ||
      (o.offerId !== undefined && o.offerId !== null),
  )
  @IsNumber(
    {},
    {
      message:
        'offerId es requerido y debe ser numérico cuando no se proporciona companyWorkerId',
    },
  )
  offerId?: number;
}

export class CreateSessionWithDetailDto {
  // Campos de Session
  @IsOptional()
  @IsNumber()
  clientId?: number;

  @IsOptional()
  sessionDatetime?: Date;

  @IsOptional()
  @IsNumber()
  sessionStatus?: number;

  @IsOptional()
  iaResponse?: any;

  @IsOptional()
  startDatetime?: Date;

  @IsOptional()
  @IsNumber()
  status?: number;

  // Array de detalles de servicios
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionDetailItemDto)
  details: SessionDetailItemDto[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionIA?: string;
}
