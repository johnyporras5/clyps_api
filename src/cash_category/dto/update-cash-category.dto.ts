import { PartialType } from '@nestjs/mapped-types';
import { CreateCashCategoryDto } from './create-cash-category.dto';

export class UpdateCashCategoryDto extends PartialType(CreateCashCategoryDto) {}
