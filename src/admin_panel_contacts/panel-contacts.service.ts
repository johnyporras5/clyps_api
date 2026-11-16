import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import {
  CreateContactLogDto,
  UpdateContactLogDto,
} from './dto/contact-log.dto';
import {
  PanelContactLog,
  type ContactChannel,
  type ContactOutcome,
} from './entities/panel-contact-log.entity';

/** Un contacto tal como lo recibe el panel. */
export interface ContactLogView {
  id: number;
  userId: number;
  channel: ContactChannel;
  outcome: ContactOutcome;
  note: string | null;
  followUpOn: string | null;
  contactedAt: string;
  createdBy: number | null;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Resumen de un dueño en la lista: su contacto más reciente y cuántos lleva. */
export interface ContactSummaryView {
  userId: number;
  total: number;
  last: ContactLogView;
}

/** Margen para el reloj del navegador, que puede ir un poco adelantado. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;
/** Antes de esto no existía Clyps: una fecha así es un error al escribirla. */
const MIN_DATE = new Date('2020-01-01T00:00:00Z');
/** Tope del historial de UN salón. Nadie le escribe 200 veces al mismo. */
const HISTORY_LIMIT = 200;

/**
 * Historial de contactos del panel de plataforma (a quién se le escribió, por
 * dónde, cómo quedó y cuándo volver a escribirle).
 *
 * Es solo del panel: nada en la app del salón lee esta tabla y el salón no ve
 * nada de esto.
 */
@Injectable()
export class PanelContactsService {
  private readonly logger = new Logger(PanelContactsService.name);

  constructor(
    @InjectRepository(PanelContactLog)
    private readonly logs: Repository<PanelContactLog>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * Un resumen por cada dueño que tenga al menos un contacto: el más reciente
   * (por `contacted_at`, y a igual fecha el último anotado) y el total.
   * Los dueños sin contactos no salen: para el panel son "Nunca contactado".
   */
  async summary(): Promise<ContactSummaryView[]> {
    const latest: { id: number | string; total: number | string }[] =
      await this.logs.query(
        `SELECT id, total FROM (
           SELECT id,
                  COUNT(*) OVER (PARTITION BY user_id) AS total,
                  ROW_NUMBER() OVER (
                    PARTITION BY user_id ORDER BY contacted_at DESC, id DESC
                  ) AS rn
             FROM panel_contact_log
         ) ranked
         WHERE rn = 1`,
      );
    if (latest.length === 0) return [];

    const totals = new Map(latest.map((r) => [Number(r.id), Number(r.total)]));
    // Las filas se cargan por el repositorio (no del SQL crudo) para que las
    // fechas se conviertan igual que en el resto de la app.
    const rows = await this.logs.findBy({ id: In([...totals.keys()]) });
    return rows.map((row) => ({
      userId: row.userId,
      total: totals.get(row.id) ?? 1,
      last: this.view(row, null),
    }));
  }

  /** Todos los contactos de un dueño, del más reciente al más viejo. */
  async history(userId: number): Promise<ContactLogView[]> {
    const rows = await this.logs.find({
      where: { userId },
      order: { contactedAt: 'DESC', id: 'DESC' },
      take: HISTORY_LIMIT,
    });
    const emails = await this.emailsOf(rows);
    return rows.map((row) =>
      this.view(row, emails.get(row.createdBy ?? -1) ?? null),
    );
  }

  async create(
    userId: number,
    dto: CreateContactLogDto,
    actorUserId: number,
  ): Promise<ContactLogView> {
    const exists = await this.users.exists({ where: { id: userId } });
    if (!exists) throw new NotFoundException('La cuenta no existe.');

    const now = new Date();
    const row = this.logs.create({
      userId,
      channel: dto.channel,
      outcome: dto.outcome ?? 'no_reply',
      note: dto.note ?? null,
      followUpOn: this.followUp(dto.followUpOn),
      contactedAt: this.contactedAt(dto.contactedAt, now),
      createdBy: actorUserId,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.logs.save(row);

    this.logger.log(
      `Contacto ${saved.id} (${saved.channel}) con la cuenta ${userId} anotado por el usuario ${actorUserId}.`,
    );
    const emails = await this.emailsOf([saved]);
    return this.view(saved, emails.get(actorUserId) ?? null);
  }

  async update(
    id: number,
    dto: UpdateContactLogDto,
    actorUserId: number,
  ): Promise<ContactLogView> {
    const row = await this.logs.findOneBy({ id });
    if (!row) throw new NotFoundException('Ese contacto ya no existe.');

    // undefined = no se tocó; null = borrar (solo nota y seguimiento).
    if (dto.channel !== undefined) row.channel = dto.channel;
    if (dto.outcome !== undefined) row.outcome = dto.outcome;
    if (dto.note !== undefined) row.note = dto.note;
    if (dto.followUpOn !== undefined) {
      row.followUpOn = this.followUp(dto.followUpOn);
    }
    row.updatedAt = new Date();

    const saved = await this.logs.save(row);
    this.logger.log(
      `Contacto ${id} de la cuenta ${row.userId} corregido por el usuario ${actorUserId}.`,
    );
    const emails = await this.emailsOf([saved]);
    return this.view(saved, emails.get(saved.createdBy ?? -1) ?? null);
  }

  /** Idempotente: borrar algo que ya no está no falla (doble clic). */
  async remove(id: number, actorUserId: number): Promise<void> {
    const result = await this.logs.delete({ id });
    if (result.affected) {
      this.logger.log(`Contacto ${id} borrado por el usuario ${actorUserId}.`);
    }
  }

  /* ---------- ayudas ---------- */

  /** 'YYYY-MM-DD' ya validado por el DTO; aquí solo se acota el año. */
  private followUp(value: string | null | undefined): string | null {
    if (!value) return null;
    const year = Number(value.slice(0, 4));
    if (year < 2020 || year > 2100) {
      throw new BadRequestException('Fecha de seguimiento fuera de rango.');
    }
    return value;
  }

  private contactedAt(value: string | undefined, now: Date): Date {
    if (!value) return now;
    const when = new Date(value);
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException('Fecha de contacto no válida.');
    }
    if (when.getTime() > now.getTime() + CLOCK_SKEW_MS) {
      throw new BadRequestException(
        'La fecha de contacto no puede ser futura.',
      );
    }
    if (when < MIN_DATE) {
      throw new BadRequestException('Fecha de contacto fuera de rango.');
    }
    return when;
  }

  /** Correo de quien anotó cada fila (para "anotado por ..."). */
  private async emailsOf(
    rows: PanelContactLog[],
  ): Promise<Map<number, string>> {
    const ids = [
      ...new Set(
        rows.map((r) => r.createdBy).filter((v): v is number => v !== null),
      ),
    ];
    if (ids.length === 0) return new Map();
    const users = await this.users.find({
      select: { id: true, email: true },
      where: { id: In(ids) },
    });
    return new Map(
      users
        .filter((u) => typeof u.email === 'string')
        .map((u) => [u.id, u.email]),
    );
  }

  private view(
    row: PanelContactLog,
    createdByEmail: string | null,
  ): ContactLogView {
    return {
      id: row.id,
      userId: row.userId,
      channel: row.channel,
      outcome: row.outcome,
      note: row.note,
      followUpOn: row.followUpOn,
      contactedAt: new Date(row.contactedAt).toISOString(),
      createdBy: row.createdBy,
      createdByEmail,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }
}
