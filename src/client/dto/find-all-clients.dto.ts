import { IsOptional, IsString, IsIn } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindAllClientsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  name?: string;

  // Filtro por estado: '1' = activo, '0' = inactivo, ausente = todos
  @IsOptional()
  @IsIn(['0', '1'])
  isActive?: string;
}
