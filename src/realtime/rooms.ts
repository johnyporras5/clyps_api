/**
 * Helpers puros para construir los nombres de las rooms de WebSockets (CLYP-240).
 * Centralizados aquí para que Gateway y Services usen exactamente los mismos
 * nombres sin strings mágicos dispersos.
 */

/** Room personal de un usuario (cualquier rol). */
export const userRoom = (userId: number | string): string => `user:${userId}`;

/** Room personal de un cliente. */
export const clientRoom = (userId: number | string): string =>
  `client:${userId}`;

/** Room personal de un worker (por su id en company_worker). */
export const workerRoom = (companyWorkerId: number | string): string =>
  `worker:${companyWorkerId}`;

/** Room PRIVADA de una empresa: solo admin + workers de la empresa. */
export const companyRoom = (companyId: number | string): string =>
  `company:${companyId}`;

/** Room PÚBLICA de una empresa: cualquier autenticado que la esté viendo. */
export const companyPublicRoom = (companyId: number | string): string =>
  `company-public:${companyId}`;
