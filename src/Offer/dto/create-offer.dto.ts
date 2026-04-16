import { IsString, IsOptional, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';
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
    @Transform(({ value }) => {
        const arr = typeof value === 'string' ? JSON.parse(value) : value;
        if (Array.isArray(arr)) {
            return arr.map((item) => Object.assign(new CreateServiceOfferDto(), item));
        }
        return arr;
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateServiceOfferDto)
    serviceOffers?: CreateServiceOfferDto[];
}
