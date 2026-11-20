import { PaginationResult } from '../../common/utils/pagination.util';
import type { SyncResponseFields } from '../../common/sync/catalog-sync.util';
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
  /**
   * Suspendido por el plan: sigue en el equipo y entra a la app, pero no
   * recibe citas nuevas ni el dueño lo puede reactivar (vuelve con el Full).
   */
  planSuspended: boolean;
  calendar: Record<string, any> | null;
  /**
   * Si puede entrar a la app: tiene cuenta (`user`) y esa cuenta tiene correo.
   * Sin correo no entra, tenga cuenta (los de antes) o no (los nuevos).
   */
  hasAccount: boolean;
  /**
   * BE-OFF-4: solo con `?since=`. true = lo quitaron del salón (borrado
   * suave): la app lo saca de su lista.
   */
  deleted?: boolean;
}
export type PaginatedWorkerListResult = PaginationResult<WorkerList> &
  SyncResponseFields;
