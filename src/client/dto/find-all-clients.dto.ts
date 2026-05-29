import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindAllClientsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  name?: string;
}
