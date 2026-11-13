import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationService } from '../notification/notification.service';
import { buildNavigationData } from '../notification/entities/notification.entity';
import { EmailService } from '../email/email.service';
import { isEmailUnavailable } from '../auth/dto/register-client-by-admin.dto';
import { BUSINESS_TIMEZONE } from '../common/utils/business-time.util';
import type { CompanyVisitFrequency } from '../client/entities/client.entity';
import {
  ATTENDED_SESSION_STATUSES,
  calendarDaysBetween,
  VisitFrequencyReminderItem,
  VisitFrequencyStage,
  visitFrequencyStage,
} from '../client/visit-frequency.util';

interface ClientRow {
  id: number;
  name: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  userId: number | null;
  userEmail: string | null;
  companies: unknown;
  inactiveCompanies: unknown;
  companyAliases: unknown;
  frequencies: unknown;
}

interface VisitRow {
  clientId: number;
  companyId: number;
  sessionId: number;
  visitedAt: Date | string;
}

interface CompanyRow {
  id: number;
  name: string | null;
  email: string | null;
  address: string | null;
  ownerId: number | null;
  ownerEmail: string | null;
  ownerName: string | null;
}

interface StaffDigest {
  userId: number;
  email: string | null;
  name: string;
  userType: string;
  items: VisitFrequencyReminderItem[];
}

const ACTIVE_SESSION_STATUSES = [1, 2, 8];
const CHUNK_SIZE = 500;

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function usableEmail(...emails: (string | null | undefined)[]): string | null {
  for (const email of emails) {
    const trimmed = (email ?? '').trim();
    if (trimmed && !isEmailUnavailable(trimmed) && trimmed.includes('@')) {
      return trimmed;
    }
  }
  return null;
}

@Injectable()
export class VisitFrequencyReminderService {
  private readonly logger = new Logger(VisitFrequencyReminderService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationService,
    private readonly emailService: EmailService,
  ) {}

  @Cron('0 9 * * *', { timeZone: BUSINESS_TIMEZONE })
  async dailyVisitFrequencyReminders(): Promise<void> {
    try {
      await this.run(new Date());
    } catch (error) {
      this.logger.warn(
        `Job dailyVisitFrequencyReminders falló: ${(error as Error).message}`,
      );
    }
  }

  async run(now: Date): Promise<{ clients: number; staff: number }> {
    const clients: ClientRow[] = await this.dataSource.query(
      `SELECT cl.id AS id,
              cl.name AS name,
              cl.last_name AS lastName,
              cl.email AS email,
              cl.phone AS phone,
              cl.user_id AS userId,
              u.email AS userEmail,
              cl.companies AS companies,
              cl.inactive_companies AS inactiveCompanies,
              cl.company_aliases AS companyAliases,
              cl.company_visit_frequencies AS frequencies
         FROM client cl
         LEFT JOIN user u ON u.id = cl.user_id
        WHERE cl.company_visit_frequencies IS NOT NULL
          AND JSON_LENGTH(cl.company_visit_frequencies) > 0
          AND cl.is_active = 1
          AND cl.temporarily_deleted = 0
          AND cl.permanently_deleted = 0`,
    );
    if (clients.length === 0) return { clients: 0, staff: 0 };

    const lastVisits = await this.lastVisitsByClientCompany(
      clients.map((c) => Number(c.id)),
    );

    const candidates: {
      client: ClientRow;
      companyId: number;
      frequencyDays: number;
      stage: VisitFrequencyStage;
      daysSince: number;
      lastVisit: VisitRow;
    }[] = [];

    for (const client of clients) {
      const companies = parseJson<number[]>(client.companies, []).map(Number);
      const inactive = parseJson<number[]>(client.inactiveCompanies, []).map(
        Number,
      );
      const entries = parseJson<CompanyVisitFrequency[]>(
        client.frequencies,
        [],
      );
      for (const entry of entries) {
        const companyId = Number(entry.companyId);
        if (!companies.includes(companyId) || inactive.includes(companyId)) {
          continue;
        }
        const lastVisit = lastVisits.get(`${client.id}:${companyId}`);
        if (!lastVisit) continue;
        const daysSince = calendarDaysBetween(
          new Date(lastVisit.visitedAt),
          now,
          BUSINESS_TIMEZONE,
        );
        const stage = visitFrequencyStage(Number(entry.days), daysSince);
        if (!stage) continue;
        candidates.push({
          client,
          companyId,
          frequencyDays: Number(entry.days),
          stage,
          daysSince,
          lastVisit,
        });
      }
    }
    if (candidates.length === 0) return { clients: 0, staff: 0 };

    const companies = await this.loadCompanies([
      ...new Set(candidates.map((c) => c.companyId)),
    ]);
    const digests = new Map<number, StaffDigest>();
    let notifiedClients = 0;

    for (const candidate of candidates) {
      const company = companies.get(candidate.companyId);
      if (!company) continue;
      if (
        await this.hasUpcomingSession(
          Number(candidate.client.id),
          candidate.companyId,
          now,
        )
      ) {
        continue;
      }

      const claimed = await this.notifications.claimReminder(
        `visit_freq_${candidate.stage}_${candidate.companyId}`,
        Number(candidate.lastVisit.sessionId),
      );
      if (!claimed) continue;

      const item = this.buildItem(candidate, company);
      await this.notifyClient(candidate.client, item, company);
      notifiedClients++;

      const staff = await this.staffFor(
        company,
        Number(candidate.lastVisit.sessionId),
      );
      for (const member of staff) {
        const digest = digests.get(member.userId) ?? {
          ...member,
          items: [],
        };
        digest.items.push({
          ...item,
          clientName: this.staffClientName(candidate.client, company.id),
        });
        digests.set(member.userId, digest);
      }
    }

    for (const digest of digests.values()) {
      await this.notifyStaff(digest);
    }

    this.logger.log(
      `Frecuencia de visitas: ${notifiedClients} cliente(s) avisados, ${digests.size} miembro(s) del negocio con resumen`,
    );
    return { clients: notifiedClients, staff: digests.size };
  }

  private async lastVisitsByClientCompany(
    clientIds: number[],
  ): Promise<Map<string, VisitRow>> {
    const result = new Map<string, VisitRow>();
    for (let i = 0; i < clientIds.length; i += CHUNK_SIZE) {
      const chunk = clientIds.slice(i, i + CHUNK_SIZE);
      const rows: VisitRow[] = await this.dataSource.query(
        `SELECT DISTINCT s.client_id AS clientId,
                COALESCE(cw.company_id, o.company_id) AS companyId,
                s.id AS sessionId,
                s.session_datetime AS visitedAt
           FROM session s
           JOIN session_detail d ON d.session_id = s.id
           LEFT JOIN company_worker cw ON cw.id = d.company_worker_id
           LEFT JOIN offer o ON o.id = d.offer_id
          WHERE s.client_id IN (?)
            AND s.session_status IN (?)
            AND s.session_datetime IS NOT NULL`,
        [chunk, ATTENDED_SESSION_STATUSES],
      );
      for (const row of rows) {
        if (!row.companyId) continue;
        const key = `${row.clientId}:${row.companyId}`;
        const current = result.get(key);
        if (
          !current ||
          new Date(row.visitedAt).getTime() >
            new Date(current.visitedAt).getTime()
        ) {
          result.set(key, row);
        }
      }
    }
    return result;
  }

  private async loadCompanies(ids: number[]): Promise<Map<number, CompanyRow>> {
    const rows: CompanyRow[] = await this.dataSource.query(
      `SELECT co.id AS id,
              co.name AS name,
              co.email AS email,
              co.address AS address,
              co.user_id AS ownerId,
              u.email AS ownerEmail,
              u.username AS ownerName
         FROM company co
         LEFT JOIN user u ON u.id = co.user_id
        WHERE co.id IN (?)
          AND co.deactivated_at IS NULL`,
      [ids],
    );
    return new Map(rows.map((r) => [Number(r.id), r]));
  }

  private async hasUpcomingSession(
    clientId: number,
    companyId: number,
    now: Date,
  ): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1
         FROM session s
         JOIN session_detail d ON d.session_id = s.id
         LEFT JOIN company_worker cw ON cw.id = d.company_worker_id
         LEFT JOIN offer o ON o.id = d.offer_id
        WHERE s.client_id = ?
          AND s.session_status IN (?)
          AND s.session_datetime >= (? - INTERVAL 1 DAY)
          AND COALESCE(cw.company_id, o.company_id) = ?
        LIMIT 1`,
      [clientId, ACTIVE_SESSION_STATUSES, now, companyId],
    );
    return rows.length > 0;
  }

  private async staffFor(
    company: CompanyRow,
    sessionId: number,
  ): Promise<Omit<StaffDigest, 'items'>[]> {
    const staff: Omit<StaffDigest, 'items'>[] = [];
    if (company.ownerId) {
      staff.push({
        userId: Number(company.ownerId),
        email: usableEmail(company.ownerEmail),
        name: company.ownerName?.trim() || company.name?.trim() || 'equipo',
        userType: 'adm',
      });
    }
    const workers: {
      userId: number;
      email: string | null;
      name: string | null;
    }[] = await this.dataSource.query(
      `SELECT DISTINCT cw.user_id AS userId,
              u.email AS email,
              w.name AS name
         FROM session_detail d
         JOIN company_worker cw ON cw.id = d.company_worker_id
         JOIN user u ON u.id = cw.user_id
         LEFT JOIN worker w ON w.id = cw.worker_id
        WHERE d.session_id = ?
          AND cw.company_id = ?
          AND cw.is_active = 1
          AND d.status <> 5
          AND u.user_type IN ('adm', 'wrk')`,
      [sessionId, company.id],
    );
    for (const worker of workers) {
      const userId = Number(worker.userId);
      if (!userId || staff.some((s) => s.userId === userId)) continue;
      staff.push({
        userId,
        email: usableEmail(worker.email),
        name: worker.name?.trim() || 'equipo',
        userType: 'wrk',
      });
    }
    return staff;
  }

  private buildItem(
    candidate: {
      client: ClientRow;
      companyId: number;
      frequencyDays: number;
      stage: VisitFrequencyStage;
      daysSince: number;
      lastVisit: VisitRow;
    },
    company: CompanyRow,
  ): VisitFrequencyReminderItem {
    return {
      stage: candidate.stage,
      clientId: Number(candidate.client.id),
      clientName: this.fullName(candidate.client),
      companyId: candidate.companyId,
      companyName: company.name?.trim() || 'tu negocio',
      frequencyDays: candidate.frequencyDays,
      daysSinceLastVisit: candidate.daysSince,
      lastVisitLabel: new Intl.DateTimeFormat('es-VE', {
        timeZone: BUSINESS_TIMEZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(candidate.lastVisit.visitedAt)),
      phone: candidate.client.phone?.trim() || null,
    };
  }

  private fullName(client: ClientRow): string {
    return (
      [client.name, client.lastName]
        .map((part) => (part ?? '').trim())
        .filter(Boolean)
        .join(' ') || 'Cliente'
    );
  }

  private staffClientName(client: ClientRow, companyId: number): string {
    const aliases = parseJson<{ companyId: number; alias: string }[]>(
      client.companyAliases,
      [],
    );
    const alias = aliases
      .find((a) => Number(a.companyId) === companyId)
      ?.alias?.trim();
    return alias || this.fullName(client);
  }

  private clientCopy(item: VisitFrequencyReminderItem): {
    title: string;
    body: string;
  } {
    const untilDue = item.frequencyDays - item.daysSinceLastVisit;
    switch (item.stage) {
      case 'soon':
        return {
          title: `Se acerca tu cita en ${item.companyName}`,
          body: `Sueles venir cada ${item.frequencyDays} días y te toca en ${untilDue === 1 ? '1 día' : `${untilDue} días`}. Agenda con tiempo para asegurar tu horario.`,
        };
      case 'due':
        return {
          title: `Ya te toca tu cita en ${item.companyName}`,
          body: `Pasaron ${item.daysSinceLastVisit} días desde tu última visita. ¡Agenda la próxima!`,
        };
      default:
        return {
          title: `Te extrañamos en ${item.companyName}`,
          body: `Pasaron ${item.daysSinceLastVisit} días desde tu última visita. Agenda tu próxima cita cuando quieras.`,
        };
    }
  }

  private staffCopy(items: VisitFrequencyReminderItem[]): {
    title: string;
    body: string;
  } {
    if (items.length === 1) {
      const [item] = items;
      const detail = `Suele venir cada ${item.frequencyDays} días y su última visita fue hace ${item.daysSinceLastVisit} días. No tiene cita agendada.`;
      switch (item.stage) {
        case 'soon':
          return {
            title: `Pronto le toca volver a ${item.clientName}`,
            body: detail,
          };
        case 'due':
          return {
            title: `Hoy le toca volver a ${item.clientName}`,
            body: detail,
          };
        default:
          return { title: `${item.clientName} está atrasado`, body: detail };
      }
    }
    const count = (stage: VisitFrequencyStage) =>
      items.filter((i) => i.stage === stage).length;
    const parts = [
      count('due') ? `hoy le toca a ${count('due')}` : '',
      count('soon') ? `pronto a ${count('soon')}` : '',
      count('overdue') === 1
        ? '1 está atrasado'
        : count('overdue')
          ? `${count('overdue')} están atrasados`
          : '',
    ].filter(Boolean);
    const summary = parts.join(', ');
    return {
      title: `${items.length} clientes por volver`,
      body: `${summary.charAt(0).toUpperCase()}${summary.slice(1)}. Ninguno tiene cita agendada.`,
    };
  }

  private async notifyClient(
    client: ClientRow,
    item: VisitFrequencyReminderItem,
    company: CompanyRow,
  ): Promise<void> {
    const copy = this.clientCopy(item);
    if (client.userId) {
      try {
        await this.notifications.createNotification(Number(client.userId), {
          type: 'reminder',
          title: copy.title,
          body: copy.body,
          data: {
            ...buildNavigationData('reminder', undefined, item.companyId),
            subtype: 'visit_frequency',
            audience: 'client',
            stage: item.stage,
          },
        });
      } catch (error) {
        this.logger.warn(
          `No se pudo notificar al cliente ${client.id}: ${(error as Error).message}`,
        );
      }
    }

    const email = usableEmail(client.userEmail, client.email);
    if (email) {
      await this.emailService.sendVisitFrequencyReminderToClient(
        email,
        client.name?.trim() || this.fullName(client),
        item,
        {
          name: item.companyName,
          email: company.email ?? undefined,
          address: company.address ?? undefined,
        },
      );
    }
  }

  private async notifyStaff(digest: StaffDigest): Promise<void> {
    const copy = this.staffCopy(digest.items);
    const single = digest.items.length === 1 ? digest.items[0] : null;
    try {
      await this.notifications.createNotification(digest.userId, {
        type: 'reminder',
        title: copy.title,
        body: copy.body,
        data: {
          ...buildNavigationData('reminder', undefined, single?.companyId),
          subtype: 'visit_frequency',
          audience: 'staff',
          ...(single ? { clientId: single.clientId, stage: single.stage } : {}),
        },
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar al usuario ${digest.userId}: ${(error as Error).message}`,
      );
    }

    if (digest.email) {
      await this.emailService.sendVisitFrequencyDigestToStaff(
        digest.email,
        digest.name,
        digest.items,
        digest.userType,
      );
    }
  }
}
