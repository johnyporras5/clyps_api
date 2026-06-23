import { Request } from 'express';

/**
 * Forma del objeto que la estrategia JWT adjunta en `req.user`
 * (ver jwt.strategy.ts → validate()).
 */
export interface AuthenticatedUser {
  sub: number;
  email: string;
  userType: 'adm' | 'wrk' | 'cli';
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
  userType: 'adm' | 'wrk' | 'cli';
  companyId?: number | null;
  companyWorkerId?: number | null;
}
