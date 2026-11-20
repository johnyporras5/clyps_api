import { ValidationPipe, type ValidationPipeOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import type { NextFunction, Request, Response } from 'express';

/**
 * Configuración HTTP de la app, en UN solo lugar: la usan main.ts y la app de
 * las pruebas de integración (test/integration/helpers/server.js). Así lo que
 * se prueba es lo que corre en producción, sin copias que se desalineen.
 */

/** Opciones del ValidationPipe global (también las usa POST /sync/push). */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
};

/**
 * BE-OFF-5: tamaño máximo del cuerpo de POST /sync/push. El resto de la app
 * sigue con el de Express (100 KB): subirlo para todos daría más margen para
 * mandar cuerpos enormes y gastar memoria del servidor. Un lote de 50
 * operaciones con notas largas puede pasar de 100 KB.
 */
export const SYNC_PUSH_BODY_LIMIT = '1mb';

export function applyHttpSetup(app: NestExpressApplication): void {
  // Detrás de Nginx / Digital Ocean: confiar en X-Forwarded-For para que el
  // rate limiting (ThrottlerGuard) cuente por IP real del cliente y no por la
  // IP del proxy.
  app.set('trust proxy', 1);

  // OJO con el nombre: Nest registra su lector de JSON al arrancar y se lo
  // SALTA si ya ve uno llamado `jsonParser` (el nombre de la función de
  // express.json). Montado tal cual, dejaría a TODOS los demás endpoints sin
  // leer JSON. Envuelto en otra función, Nest no lo confunde; y como este lee
  // el cuerpo primero, el lector general ve `req._body` y no lo vuelve a leer.
  const syncPushJson = json({ limit: SYNC_PUSH_BODY_LIMIT });
  app.use(
    '/sync/push',
    function syncPushBodyParser(
      req: Request,
      res: Response,
      next: NextFunction,
    ) {
      syncPushJson(req, res, next);
    },
  );

  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
}
