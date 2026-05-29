import { IsOptional, IsString, Length } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryIAPromptDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @Length(1, 1)
  type?: string; // 'p' o 'c'
}
