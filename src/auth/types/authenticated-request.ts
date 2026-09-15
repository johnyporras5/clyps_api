import { Request } from 'express';

/**
 * Forma del objeto que la estrategia JWT adjunta en `req.user`
 * (ver jwt.strategy.ts → validate()).
 *
 * `padm` es el administrador de la PLATAFORMA — quien opera la app, no el dueño
 * de un salón (`adm`). No pertenece a ninguna company: sus endpoints cruzan
 * todos los tenants (SUB-4).
 */
/** Roles que viven dentro de un salón. */
export type TenantRole = 'adm' | 'wrk' | 'cli';

/** Todos los roles, incluido el administrador de la plataforma. */
export type UserRole = TenantRole | 'padm';

/**
 * Quién está DE VERDAD detrás de la petición cuando el administrador de la
 * plataforma entra a un salón ajeno (claim `act`, delegación de la RFC 8693).
 *
 * Ojo a la asimetría, que es el punto entero de esto: `sub` sigue siendo el
 * DUEÑO del salón, para que cada consulta devuelva lo mismo que él vería sin
 * tocar una línea de los módulos de negocio. `act` es la persona real. El día
 * que haya que contestar "¿quién borró esta cita?", la respuesta está aquí y
 * no en `sub`.
 */
export interface ActorClaim {
  /** Id del `padm` que abrió la sesión. */
  sub: number;
  email: string | null;
}

export interface AuthenticatedUser {
  sub: number;
  email: string;
  userType: UserRole;
  companyId: number | null;
  companyWorkerId: number | null;
  /** Algunos endpoints leen `req.user?.id` como fallback; el JWT solo emite `sub`. */
  id?: number;
  /**
   * Presente SOLO en una sesión suplantada; `undefined` en un login normal, que
   * es el caso de casi todas las peticiones. `if (req.user.act)` es la forma de
   * saber que quien actúa es el operador de la plataforma y no el dueño.
   */
  act?: ActorClaim;
  /** Id de la fila de `impersonation_session`. Solo en sesión suplantada. */
  imp?: number;
}

/** Request de Express con el usuario autenticado ya resuelto por el JwtAuthGuard. */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

/** Claims que viajan firmados dentro del JWT (ver auth.service → payload). */
export interface JwtPayload {
  sub: number;
  email: string;
  userType: UserRole;
  companyId?: number | null;
  companyWorkerId?: number | null;
  /** Solo en tokens de suplantación (ver impersonation.service.ts). */
  act?: ActorClaim;
  imp?: number;
}
