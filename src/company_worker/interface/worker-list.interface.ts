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
  /** Si tiene cuenta (`user`). Sin correo no la tiene hasta que se le asigna uno. */
  hasAccount: boolean;
}
export type PaginatedWorkerListResult = PaginationResult<WorkerList>;
