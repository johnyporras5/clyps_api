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
}
export type PaginatedWorkerListResult = PaginationResult<WorkerList>;