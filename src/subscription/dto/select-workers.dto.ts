import { ArrayNotEmpty, IsArray, IsInt, IsPositive } from 'class-validator';

/**
 * Los trabajadores con los que el dueño se queda cuando su equipo no cabe en
 * su plan. El resto queda suspendido por el plan.
 */
export class SelectWorkersDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  keepCompanyWorkerIds: number[];
}
