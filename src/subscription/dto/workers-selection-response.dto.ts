import type { PaginationResult } from '../../common/dto/pagination.dto';
import type { PlanId } from '../config/plans.config';

/**
 * Respuesta de GET/POST /subscription/workers-selection: lo que pinta la
 * pantalla "Escoge con quiénes te quedas".
 */
export interface WorkersSelectionResponse {
  /**
   * Hay que escoger. Cuando pasa a `false` (después de escoger, o porque el
   * equipo ya cabe) el front suelta la pantalla y deja entrar al resto.
   */
  required: boolean;
  /** El plan que rige ahora: el que fija el tope. */
  planId: PlanId;
  planName: string;
  /** Cuántos tiene que escoger: exactamente este número. */
  maxWorkers: number;
  /**
   * Los candidatos de ESTA página: activos y sin suspender. Después de
   * escoger quedan solo los escogidos.
   */
  workers: Array<{
    companyWorkerId: number;
    workerId: number;
    fullName: string;
    pictureURL: string;
    /**
     * Citas agendadas o en proceso que todavía no ocurrieron. No cambia nada
     * si lo suspende —esas citas siguen su curso—, pero ayuda a decidir.
     */
    pendingAppointments: number;
  }>;
  /** La paginación de `workers`. `total` es cuántos candidatos hay en todo. */
  meta: PaginationResult<unknown>['meta'];
}
