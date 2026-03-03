import { IsString, IsOptional, IsDateString, IsEnum, IsArray, ValidateNested, IsNumber, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { OfferStatus } from '../entities/offer.entity';
import { CreateServiceOfferDto } from './create-service-offer.dto';

export class CreateOfferDto {
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    logo?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsEnum(OfferStatus)
    status?: number;

    @IsOptional()
    startDate: Date;

    @IsOptional()
    endDate: Date;


    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateServiceOfferDto)
    serviceOffers?: CreateServiceOfferDto[];
}