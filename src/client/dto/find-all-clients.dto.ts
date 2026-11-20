import { IsOptional, IsString, IsIn } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindAllClientsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  name?: string;

  // Filtro por estado. '1' o AUSENTE = los clientes vivos del salón (es el
  // caso normal: los eliminados no salen en la lista). '0' = los eliminados.
  //
  // Ausente ya no significa "todos": desde que `inactive_companies` pasó a
  // significar eliminado, devolver todos mezclaría en la lista del salón a
  // clientes que el admin quitó a propósito.
  @IsOptional()
  @IsIn(['0', '1'])
  isActive?: string;

  /**
   * BE-OFF-4: solo lo que cambió después de esta fecha (la `serverTime` de la
   * sincronización anterior). Con `since` se ignoran `name` e `isActive` y
   * vienen también los eliminados del salón, con `deleted: true`.
   */
  @IsOptional()
  @IsString()
  since?: string;
}
