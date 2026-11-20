import { IsOptional, IsString, IsIn } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindServicesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  name?: string;

  // Filtro por estado: '1' = activo, '0' = inactivo, ausente = todos
  @IsOptional()
  @IsIn(['0', '1'])
  status?: string;

  /**
   * BE-OFF-4: solo lo que cambió después de esta fecha (la `serverTime` de la
   * sincronización anterior). Con `since` se ignoran `name` y `status`: la
   * app necesita enterarse también de los que pasaron a inactivos.
   */
  @IsOptional()
  @IsString()
  since?: string;
}
