import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ValidationPipe,
  type Type,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { VALIDATION_PIPE_OPTIONS } from '../bootstrap/http-setup';
import { AuthController } from '../auth/auth.controller';
import { RegisterClientByAdminDto } from '../auth/dto/register-client-by-admin.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import {
  hashRequest,
  isStoredError,
} from '../idempotency/idempotency.interceptor';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CreateSessionWithDetailDto } from '../session/dto/create-session-with-detail.dto';
import { SessionController } from '../session/session.controller';
import { SessionNotificationEmitter } from '../session/session-notification.emitter';
import { SessionRealtimeEmitter } from '../session/session-realtime.emitter';
import { SessionService } from '../session/session.service';
import { SubscriptionAccessGuard } from '../subscription/guards/subscription-access.guard';
import type { SyncOperationDto } from './dto/sync-push.dto';

/** Resultado de una operación del lote: lo que habría respondido su endpoint. */
export interface SyncOperationResult {
  idempotencyKey: string;
  status: number;
  body: unknown;
  /** true = ya se había procesado antes; es la respuesta guardada. */
  replayed?: true;
}

/**
 * Los recibos de idempotencia se guardan con el nombre del endpoint suelto,
 * igual que el interceptor (`Controlador.metodo`). Así una operación enviada
 * suelta y luego dentro de un lote (o al revés) es LA MISMA: no se duplica.
 */
const SESSION_ENDPOINT = `${SessionController.name}.${SessionController.prototype.createSessionWithDetail.name}`;
const CLIENT_ENDPOINT = `${AuthController.name}.${AuthController.prototype.registerClientByAdmin.name}`;

/** El MISMO ValidationPipe que main.ts aplica a cada endpoint (mismas opciones). */
const validationPipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

/**
 * El endpoint suelto de crear cliente recibe form-data: todos los campos
 * llegan como TEXTO. Para que la misma operación dé el mismo hash por las dos
 * vías, el payload JSON se pasa a texto antes de calcularlo.
 */
const asFormFields = (payload: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(payload)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [
        k,
        typeof v === 'object' ? JSON.stringify(v) : String(v),
      ]),
  );

/**
 * BE-OFF-5: POST /sync/push. Procesa en orden, una por una, las operaciones
 * que la app guardó sin red. Cada operación hace EXACTAMENTE lo mismo que su
 * endpoint suelto: el mismo bloqueo de suscripción, la misma validación, la
 * misma idempotencia (BE-OFF-1), el mismo 409 SLOT_TAKEN (BE-OFF-2), el mismo
 * createdOfflineAt (BE-OFF-3) y los mismos avisos al salón.
 *
 * Una operación que falla no detiene las demás; solo las que dependen de ella
 * (`clientRef`) responden 424 DEPENDENCY_FAILED.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly authService: AuthService,
    private readonly idempotency: IdempotencyService,
    private readonly subscriptionGuard: SubscriptionAccessGuard,
    private readonly realtimeEmitter: SessionRealtimeEmitter,
    private readonly notificationEmitter: SessionNotificationEmitter,
  ) {}

  async push(
    user: AuthenticatedUser,
    operations: SyncOperationDto[],
  ): Promise<{ results: SyncOperationResult[] }> {
    const done = new Map<
      string,
      SyncOperationResult & { type: SyncOperationDto['type'] }
    >();
    const results: SyncOperationResult[] = [];

    for (const op of operations) {
      const result = await this.run(user, op, done).catch((error: unknown) =>
        this.errorResult(op.idempotencyKey, error),
      );
      results.push(result);
      done.set(op.idempotencyKey.trim().toLowerCase(), {
        ...result,
        type: op.type,
      });
    }

    return { results };
  }

  private async run(
    user: AuthenticatedUser,
    op: SyncOperationDto,
    done: Map<string, SyncOperationResult & { type: SyncOperationDto['type'] }>,
  ): Promise<SyncOperationResult> {
    if (op.type === 'create_client') {
      if (op.clientRef) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'CLIENT_REF_NOT_ALLOWED',
          message: 'clientRef solo se usa en operaciones create_session.',
        });
      }
      await this.subscriptionGuard.checkAccess(
        user,
        // Solo se leen sus marcas (metadata); el método nunca se llama.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        AuthController.prototype.registerClientByAdmin,
        AuthController,
        'POST /sync/push create_client',
      );
      return this.idempotent(
        user,
        op.idempotencyKey,
        CLIENT_ENDPOINT,
        hashRequest(asFormFields(op.payload)),
        async () => {
          const dto = await this.validate(RegisterClientByAdminDto, op.payload);
          // Sin foto: el lote es JSON. Los clientes con foto van por el
          // endpoint suelto (multipart).
          return this.authService.registerClientByAdmin(dto, user, undefined);
        },
      );
    }

    // create_session
    const payload: Record<string, unknown> = { ...op.payload };
    if (op.clientRef) {
      const resolved = await this.resolveClientRef(user, op.clientRef, done);
      if (typeof resolved !== 'number') {
        return {
          idempotencyKey: op.idempotencyKey,
          status: HttpStatus.FAILED_DEPENDENCY,
          body: {
            statusCode: HttpStatus.FAILED_DEPENDENCY,
            code: 'DEPENDENCY_FAILED',
            message: resolved,
            dependsOn: op.clientRef,
          },
        };
      }
      payload.clientId = resolved;
    }

    await this.subscriptionGuard.checkAccess(
      user,
      // Solo se leen sus marcas (metadata); el método nunca se llama.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      SessionController.prototype.createSessionWithDetail,
      SessionController,
      'POST /sync/push create_session',
    );
    return this.idempotent(
      user,
      op.idempotencyKey,
      SESSION_ENDPOINT,
      // El hash va con el cliente ya resuelto: es el mismo body que habría
      // mandado la app al endpoint suelto.
      hashRequest(payload),
      async () => {
        const dto = await this.validate(CreateSessionWithDetailDto, payload);
        const result = await this.sessionService.createSessionWithDetail(
          dto,
          user,
        );
        // Los mismos avisos que el controlador (tiempo real + push al salón).
        const sessionId = result?.createdDetails?.[0]?.sessionId;
        if (sessionId) {
          await this.realtimeEmitter.emitCreated(sessionId);
          await this.notificationEmitter.notifyCreated(sessionId, user.sub);
        }
        return result;
      },
    );
  }

  /**
   * El id del cliente que creó la operación `clientRef`: primero en este
   * lote; si no, en los recibos guardados de ESTE usuario (un lote anterior o
   * el endpoint suelto). Devuelve un texto con el motivo si no se puede usar.
   */
  private async resolveClientRef(
    user: AuthenticatedUser,
    clientRef: string,
    done: Map<string, SyncOperationResult & { type: SyncOperationDto['type'] }>,
  ): Promise<number | string> {
    const key = clientRef.trim().toLowerCase();
    const inBatch = done.get(key);
    if (inBatch) {
      if (inBatch.type !== 'create_client') {
        return 'clientRef no apunta a una operación create_client.';
      }
      if (inBatch.status >= 300) {
        return `La operación create_client ${clientRef} falló (HTTP ${inBatch.status}).`;
      }
      return this.clientIdOf(inBatch.body, clientRef);
    }

    const stored = await this.idempotency.findResult(
      user.sub,
      key,
      CLIENT_ENDPOINT,
    );
    if (!stored) {
      return `No se encontró la operación create_client ${clientRef}. Debe ir antes en el lote o en un lote anterior.`;
    }
    if (stored.state === 'processing') {
      return `La operación create_client ${clientRef} todavía se está procesando.`;
    }
    if (stored.status !== null && stored.status >= 300) {
      return `La operación create_client ${clientRef} falló (HTTP ${stored.status}).`;
    }
    return this.clientIdOf(stored.body, clientRef);
  }

  private clientIdOf(body: unknown, clientRef: string): number | string {
    const id = Number((body as { clientId?: unknown } | null)?.clientId);
    return Number.isInteger(id) && id > 0
      ? id
      : `La operación create_client ${clientRef} no devolvió un cliente.`;
  }

  /**
   * Lo mismo que IdempotencyInterceptor, para una operación del lote: si la
   * clave ya terminó, devuelve lo guardado; si no, ejecuta y guarda.
   */
  private async idempotent(
    user: AuthenticatedUser,
    rawKey: string,
    endpoint: string,
    requestHash: string,
    execute: () => Promise<unknown>,
  ): Promise<SyncOperationResult> {
    const key = rawKey.trim().toLowerCase();
    const started = await this.idempotency.begin({
      userId: user.sub,
      key,
      endpoint,
      requestHash,
    });

    if (started.kind === 'replay') {
      return {
        idempotencyKey: rawKey,
        status: started.status ?? HttpStatus.CREATED,
        body: started.body,
        replayed: true,
      };
    }

    try {
      const body = await execute();
      await this.idempotency
        .complete(started.id, body)
        .catch((error) =>
          this.logger.error(
            `No se pudo guardar el recibo ${started.id} (${endpoint}).`,
            error,
          ),
        );
      return { idempotencyKey: rawKey, status: HttpStatus.CREATED, body };
    } catch (error) {
      const settle = isStoredError(error)
        ? this.idempotency.complete(
            started.id,
            error.getResponse(),
            error.getStatus(),
          )
        : this.idempotency.release(started.id);
      await settle.catch((settleError) =>
        this.logger.error(
          `No se pudo cerrar el recibo ${started.id} (${endpoint}).`,
          settleError,
        ),
      );
      throw error;
    }
  }

  private async validate<T extends object>(
    dtoClass: Type<T>,
    payload: Record<string, unknown>,
  ): Promise<T> {
    return (await validationPipe.transform(structuredClone(payload), {
      type: 'body',
      metatype: dtoClass,
    })) as T;
  }

  /** El error como lo habría respondido el endpoint suelto. */
  private errorResult(key: string, error: unknown): SyncOperationResult {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      return {
        idempotencyKey: key,
        status: error.getStatus(),
        body:
          typeof response === 'string'
            ? { statusCode: error.getStatus(), message: response }
            : response,
      };
    }
    // Sin detalles internos en la respuesta (igual que Nest con un 500).
    this.logger.error(`Operación ${key} falló de forma inesperada.`, error);
    return {
      idempotencyKey: key,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      },
    };
  }
}
