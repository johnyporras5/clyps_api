import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from 'src/common/dto/pagination.dto';

/**
 * Query de GET /workerfeedbacks (admin): paginación + filtro opcional por
 * `workerId`. Extiende PaginationDto para que la whitelist de Nest acepte el
 * parámetro (antes lo rechazaba con 400 "property workerId should not exist").
 */
export class ListWorkerFeedbackQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workerId?: number;
}
