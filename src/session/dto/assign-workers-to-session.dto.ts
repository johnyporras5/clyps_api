import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsPositive,
  ValidateNested,
} from 'class-validator';

export class AssignmentItemDto {
  @IsInt()
  @IsPositive()
  detailId: number;

  @IsInt()
  @IsPositive()
  companyWorkerId: number;
}

export class AssignWorkersToSessionDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AssignmentItemDto)
  assignments: AssignmentItemDto[];
}
