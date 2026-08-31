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

export interface AuthenticatedUser {
  sub: number;
  email: string;
  userType: UserRole;
  companyId: number | null;
  companyWorkerId: number | null;
  /** Algunos endpoints leen `req.user?.id` como fallback; el JWT solo emite `sub`. */
  id?: number;
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
}
