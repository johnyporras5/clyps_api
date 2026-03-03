import { IsNumber, Min } from 'class-validator';

export class CreateServiceOfferDto {
  @IsNumber()
  serviceId: number;

  @IsNumber()
  @Min(0)
  price: number;
}