import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { IdempotencyKey } from './entities/idempotency-key.entity';

/**
 * Una fila en `processing` más vieja que esto se da por abandonada: el
 * servidor se cayó o se reinició a mitad de la petición. Ninguna de las
 * peticiones protegidas tarda ni de lejos tanto.
 */
export const STALE_PROCESSING_MS = 2 * 60 * 1000;

/** Cuánto se guarda un recibo. Lo que una cola offline puede esperar. */
export const RETENTION_DAYS = 30;

export type BeginResult =
  | { kind: 'started'; id: number }
  /** `status` null = éxito; un número = rechazo guardado (p. ej. 409). */
  | { kind: 'replay'; body: unknown; status: number | null };

export interface BeginInput {
  userId: number;
  key: string;
  endpoint: string;
  requestHash: string;
}

const isDuplicateEntry = (error: unknown): boolean => {
  const code =
    (error as { code?: string })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === 'ER_DUP_ENTRY';
};

/**
 * BE-OFF-1. Guarda un "recibo" por cada `Idempotency-Key` para que un reintento
 * de la app (la red se cortó después de que el servidor procesó la petición)
 * reciba la misma respuesta en vez de crear una cita o un cliente duplicado.
 *
 * La reserva de la clave es el INSERT contra el índice único
 * (user_id, idem_key): si dos envíos llegan a la vez, solo uno lo consigue.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly keys: Repository<IdempotencyKey>,
  ) {}

  async begin(input: BeginInput): Promise<BeginResult> {
    // Dos vueltas: si la fila que chocó desaparece justo entonces (la otra
    // petición falló y la liberó), se vuelve a intentar reservar.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const row = await this.keys.save(
          this.keys.create({
            userId: input.userId,
            idemKey: input.key,
            endpoint: input.endpoint,
            requestHash: input.requestHash,
            status: 'processing',
            responseStatus: null,
            responseBody: null,
            createdAt: new Date(),
            completedAt: null,
          }),
        );
        return { kind: 'started', id: row.id };
      } catch (error) {
        if (!isDuplicateEntry(error)) throw error;
      }

      const existing = await this.keys.findOne({
        where: { userId: input.userId, idemKey: input.key },
      });
      if (!existing) continue;

      if (
        existing.endpoint !== input.endpoint ||
        existing.requestHash !== input.requestHash
      ) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          code: 'IDEMPOTENCY_KEY_REUSED',
          message:
            'Esta Idempotency-Key ya se usó con otra petición. Genera una clave nueva para cada operación.',
        });
      }

      if (existing.status === 'done') {
        return {
          kind: 'replay',
          body:
            existing.responseBody == null
              ? null
              : (JSON.parse(existing.responseBody) as unknown),
          status: existing.responseStatus ?? null,
        };
      }

      if (await this.takeOverIfStale(existing.id)) {
        this.logger.warn(
          `Idempotency-Key abandonada retomada (fila ${existing.id}, ${input.endpoint}, usuario ${input.userId}).`,
        );
        return { kind: 'started', id: existing.id };
      }

      throw new ConflictException({
        statusCode: 409,
        code: 'IDEMPOTENCY_IN_PROGRESS',
        message:
          'Esta operación ya se está procesando. Vuelve a intentarlo en unos segundos.',
      });
    }

    throw new ConflictException({
      statusCode: 409,
      code: 'IDEMPOTENCY_IN_PROGRESS',
      message:
        'Esta operación ya se está procesando. Vuelve a intentarlo en unos segundos.',
    });
  }

  /**
   * Reclama una fila `processing` abandonada con un UPDATE condicional: si dos
   * reintentos llegan a la vez, solo a uno le afecta la fila.
   */
  private async takeOverIfStale(id: number): Promise<boolean> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - STALE_PROCESSING_MS);
    const result = await this.keys
      .createQueryBuilder()
      .update(IdempotencyKey)
      .set({ createdAt: now })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: 'processing' })
      .andWhere('created_at < :cutoff', { cutoff })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /**
   * Guarda la respuesta final. `responseStatus` va solo para un rechazo
   * definitivo (p. ej. 409 SLOT_TAKEN); en un éxito queda NULL.
   */
  async complete(
    id: number,
    body: unknown,
    responseStatus: number | null = null,
  ): Promise<void> {
    await this.keys.update(
      { id },
      {
        status: 'done',
        responseStatus,
        responseBody: JSON.stringify(body ?? null),
        completedAt: new Date(),
      },
    );
  }

  /** La petición falló: se libera la clave para que el reintento la ejecute. */
  async release(id: number): Promise<void> {
    await this.keys.delete({ id, status: 'processing' });
  }

  @Cron('15 3 * * *', { timeZone: 'America/Caracas' })
  async purgeOld(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    try {
      const result = await this.keys.delete({ createdAt: LessThan(cutoff) });
      const deleted = result.affected ?? 0;
      if (deleted > 0) {
        this.logger.log(`🧹 Eliminados ${deleted} recibos de idempotencia.`);
      }
      return deleted;
    } catch (error) {
      this.logger.error('Error limpiando recibos de idempotencia:', error);
      return 0;
    }
  }
}
