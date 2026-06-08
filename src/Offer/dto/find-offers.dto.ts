import { IsOptional, IsIn } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindOffersDto extends PaginationDto {
  // Filtro por estado: '1' = activa, '0' = inactiva, ausente = todas
  @IsOptional()
  @IsIn(['0', '1'])
  status?: string;
}
