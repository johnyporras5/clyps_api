import { PaginationResult } from '../../common/utils/pagination.util';
export interface WorkerList {
  companyWorkerId: number;
  workerId: number;
  fullName: string;
  picture: string;
  pictureURL: string;
  averageRating: string;
  totalReviews: number;
  startDate: Date;
  endDate: Date;
  isActive: number;
  calendar: Record<string, any> | null;
  /**
   * Si puede entrar a la app: tiene cuenta (`user`) y esa cuenta tiene correo.
   * Sin correo no entra, tenga cuenta (los de antes) o no (los nuevos).
   */
  hasAccount: boolean;
}
export type PaginatedWorkerListResult = PaginationResult<WorkerList>;
