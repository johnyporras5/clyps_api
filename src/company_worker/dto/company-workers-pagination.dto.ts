import { IsOptional, IsString, IsIn } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CompanyWorkersPaginationDto extends PaginationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['0', '1'])
  isActive?: string;

  /**
   * BE-OFF-4: solo lo que cambió después de esta fecha (la `serverTime` de la
   * sincronización anterior). Con `since` se ignoran `name` e `isActive` y
   * vienen también los quitados del salón, con `deleted: true`.
   */
  @IsOptional()
  @IsString()
  since?: string;
}
