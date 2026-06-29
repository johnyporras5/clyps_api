import { IsOptional, IsString, Length } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryIAPromptDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @Length(1, 5)
  type?: string; // 'c', 'p' o 'pg'
}
