import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  PAYMENT_METHODS,
  PAYMENT_REPORT_STATUSES,
  type PaymentMethod,
  type PaymentReportStatus,
} from '../subscription.enums';

/** Filtros de la cola de verificación (SUB-4). */
export class QueryAdminPaymentsDto extends PaginationDto {
  /** Por defecto `reported`: la cola es lo que está por verificar. */
  @IsOptional()
  @IsIn([...PAYMENT_REPORT_STATUSES])
  status?: PaymentReportStatus;

  @IsOptional()
  @IsIn([...PAYMENT_METHODS])
  method?: PaymentMethod;
}
