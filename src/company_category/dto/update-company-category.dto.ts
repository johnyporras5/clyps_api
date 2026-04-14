import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyCategoryDto } from './create-company-category.dto';

export class UpdateCompanyCategoryDto extends PartialType(CreateCompanyCategoryDto) {}