import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { Response } from 'express';
import { Observable, catchError, from, mergeMap, of, throwError } from 'rxjs';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { IdempotencyService } from './idempotency.service';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const REPLAYED_HEADER = 'Idempotent-Replayed';

/**
 * Rechazos que son la respuesta DEFINITIVA a esa operación y se guardan para
 * la clave igual que un éxito (BE-OFF-2). SLOT_TAKEN: la primera cita que
 * llegó ganó el horario; aunque después se libere, el reintento de la segunda
 * sigue recibiendo el 409. Cualquier otro error libera la clave.
 */
export const STORED_ERROR_CODES: ReadonlySet<string> = new Set(['SLOT_TAKEN']);

/** El error es un rechazo definitivo que se guarda en el recibo. */
export const isStoredError = (error: unknown): error is HttpException => {
  if (!(error instanceof HttpException)) return false;
  const body = error.getResponse();
  const code =
    body && typeof body === 'object'
      ? (body as { code?: unknown }).code
      : undefined;
  return typeof code === 'string' && STORED_ERROR_CODES.has(code);
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** JSON con las llaves ordenadas: el mismo body da el mismo hash. */
const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

export const hashRequest = (
  body: unknown,
  file?: { buffer?: Buffer } | null,
): string => {
  const hash = createHash('sha256').update(stableStringify(body ?? {}));
  if (file?.buffer) {
    hash.update('|file:');
    hash.update(createHash('sha256').update(file.buffer).digest('hex'));
  }
  return hash.digest('hex');
};

/**
 * BE-OFF-1. Se pone en los endpoints que crean algo y que la app puede
 * reintentar desde su cola offline:
 *
 *   @UseInterceptors(IdempotencyInterceptor)
 *
 * Si va con `FileInterceptor`, ponerlo DESPUÉS en el mismo decorador, para que
 * el body y la foto ya estén leídos al calcular el hash.
 *
 * - Sin header → la petición sigue como siempre (apps viejas).
 * - Clave nueva → se ejecuta y se guarda la respuesta.
 * - Clave ya terminada → se devuelve la respuesta guardada sin ejecutar nada
 *   (tampoco se repiten avisos realtime ni push: salen del handler).
 * - Clave en curso → 409 IDEMPOTENCY_IN_PROGRESS.
 * - Clave con otro contenido → 422 IDEMPOTENCY_KEY_REUSED.
 * - Si el handler falla, la clave se libera para que el reintento la ejecute,
 *   salvo un rechazo definitivo (409 SLOT_TAKEN), que se guarda y se repite.
 *
 * El recibo es del usuario del token: otro usuario con la misma clave no ve
 * nada ajeno, simplemente crea lo suyo.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
      body?: unknown;
      file?: { buffer?: Buffer };
    }>();
    const response = http.getResponse<Response>();

    const raw = request.headers[IDEMPOTENCY_HEADER];
    if (raw === undefined) return next.handle();

    if (typeof raw !== 'string' || !UUID_RE.test(raw.trim())) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'El header Idempotency-Key debe ser un UUID.',
      });
    }

    const userId = request.user?.sub;
    // Los endpoints protegidos exigen JWT; sin usuario no hay a quién atar
    // el recibo, así que no se aplica.
    if (!userId) return next.handle();

    const key = raw.trim().toLowerCase();
    const endpoint = `${context.getClass().name}.${context.getHandler().name}`;
    const requestHash = hashRequest(request.body, request.file);

    return from(
      this.idempotency.begin({ userId, key, endpoint, requestHash }),
    ).pipe(
      mergeMap((started) => {
        if (started.kind === 'replay') {
          response.setHeader(REPLAYED_HEADER, 'true');
          // Rechazo guardado (409 SLOT_TAKEN): se repite el mismo error.
          if (started.status !== null && started.status >= 400) {
            return throwError(
              () =>
                new HttpException(
                  started.body as Record<string, unknown>,
                  started.status as number,
                ),
            );
          }
          return of(started.body);
        }

        return next.handle().pipe(
          mergeMap((body) =>
            from(
              this.idempotency.complete(started.id, body).catch((error) => {
                // La creación YA ocurrió: la respuesta sale igual. La fila
                // queda en `processing` y se podrá retomar como abandonada.
                this.logger.error(
                  `No se pudo guardar el recibo ${started.id} (${endpoint}).`,
                  error,
                );
              }),
            ).pipe(mergeMap(() => of(body))),
          ),
          catchError((error: unknown) => {
            // Rechazo definitivo (409 SLOT_TAKEN): queda guardado para la
            // clave. Cualquier otro error libera la clave para el reintento.
            const settle = isStoredError(error)
              ? this.idempotency.complete(
                  started.id,
                  error.getResponse(),
                  error.getStatus(),
                )
              : this.idempotency.release(started.id);
            return from(
              settle.catch((settleError) => {
                this.logger.error(
                  `No se pudo cerrar el recibo ${started.id} (${endpoint}).`,
                  settleError,
                );
              }),
            ).pipe(mergeMap(() => throwError(() => error)));
          }),
        );
      }),
    );
  }
}
